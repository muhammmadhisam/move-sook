import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  toBlogPostDto,
  pageArgs,
  orderByOf,
  writeAudit,
} from '@movesook/services/support';
import type {
  AdminListBlogQuery,
  AdminCreateBlogInput,
  AdminUpdateBlogInput,
  BlogPostDto,
} from '@movesook/shared';

export type BlogListResponse = {
  items: BlogPostDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Blog posts (list). */
export async function listBlog(q: AdminListBlogQuery): Promise<BlogListResponse> {
  const where = q.status ? { status: q.status } : {};
  const [rows, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'publishedAt', 'title'], 'createdAt'),
      ...pageArgs(q),
    }),
    prisma.blogPost.count({ where }),
  ]);
  const items: BlogPostDto[] = rows.map(toBlogPostDto);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Single blog post. */
export async function getBlogPost(id: string): Promise<BlogPostDto> {
  const row = await prisma.blogPost.findUnique({ where: { id } });
  if (!row) throw new HTTPException(404, { message: 'Blog post not found' });
  return toBlogPostDto(row);
}

/** Create a blog post. */
export async function createBlog(
  sub: string,
  input: AdminCreateBlogInput,
): Promise<BlogPostDto> {
  const slug = input.slug.trim().toLowerCase();
  const existing = await prisma.blogPost.findUnique({ where: { slug } });
  if (existing) throw new HTTPException(409, { message: 'มี slug นี้อยู่แล้ว' });
  const status = input.status ?? 'DRAFT';
  const row = await prisma.blogPost.create({
    data: {
      slug,
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      coverImageUrl: input.coverImageUrl ?? null,
      ...(input.author ? { author: input.author } : {}),
      status,
      // Stamp publishedAt the moment it first goes live so ordering/sitemap work.
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
    },
  });
  await writeAudit({ actorId: sub, action: 'blog.create', targetType: 'setting', targetId: row.id });
  return toBlogPostDto(row);
}

/** Update a blog post. */
export async function updateBlog(
  sub: string,
  id: string,
  input: AdminUpdateBlogInput,
): Promise<BlogPostDto> {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw new HTTPException(404, { message: 'Blog post not found' });
  if (input.slug !== undefined) {
    const slug = input.slug.trim().toLowerCase();
    const clash = await prisma.blogPost.findUnique({ where: { slug } });
    if (clash && clash.id !== id) throw new HTTPException(409, { message: 'มี slug นี้อยู่แล้ว' });
  }
  // First transition to PUBLISHED stamps publishedAt; later edits keep it.
  const goingLive = input.status === 'PUBLISHED' && existing.publishedAt === null;
  const row = await prisma.blogPost.update({
    where: { id },
    data: {
      ...(input.slug !== undefined ? { slug: input.slug.trim().toLowerCase() } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
      ...(input.author !== undefined ? { author: input.author } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(goingLive ? { publishedAt: new Date() } : {}),
    },
  });
  await writeAudit({ actorId: sub, action: 'blog.update', targetType: 'setting', targetId: id });
  return toBlogPostDto(row);
}

/** Delete a blog post. */
export async function deleteBlog(
  sub: string,
  id: string,
): Promise<{ id: string; deleted: true }> {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw new HTTPException(404, { message: 'Blog post not found' });
  await prisma.blogPost.delete({ where: { id } });
  await writeAudit({ actorId: sub, action: 'blog.delete', targetType: 'setting', targetId: id });
  return { id, deleted: true };
}

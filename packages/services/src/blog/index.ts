import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import type { BlogPostListResponse, BlogPostPublic, BlogPostSummary } from '@movesook/shared';

// Public marketing blog (no auth). The admin-managed source of truth lives in
// the BlogPost table; writes are in routes/admin.ts. Only PUBLISHED posts are
// ever exposed here — drafts are admin-only. HTTP routing lives in
// apps/api/src/routes/blog.ts — these functions return wire DTOs.

/** List published posts, newest first (blog index + sitemap). */
export async function listPublishedPosts(): Promise<BlogPostListResponse> {
  const rows = await prisma.blogPost.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
  });
  const items: BlogPostSummary[] = rows.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    coverImageUrl: p.coverImageUrl,
    author: p.author,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  }));
  return { items };
}

/** One published post by slug (full Markdown body). */
export async function getPublishedPost(slug: string): Promise<BlogPostPublic> {
  const p = await prisma.blogPost.findFirst({ where: { slug, status: 'PUBLISHED' } });
  if (!p) throw new HTTPException(404, { message: 'Blog post not found' });
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    coverImageUrl: p.coverImageUrl,
    author: p.author,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    body: p.body,
  };
}

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import type { BlogPostListResponse, BlogPostPublic, BlogPostSummary } from '@movesook/shared';
import type { AppEnv } from '../lib/context';

// Public marketing blog (no auth). The admin-managed source of truth lives in
// the BlogPost table; writes are in routes/admin.ts. Only PUBLISHED posts are
// ever exposed here — drafts are admin-only.
export const blogRoutes = new Hono<AppEnv>()
  // List published posts, newest first (blog index + sitemap).
  .get('/', async (c) => {
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
    const body: BlogPostListResponse = { items };
    return c.json(body);
  })
  // One published post by slug (full Markdown body).
  .get('/:slug', async (c) => {
    const slug = c.req.param('slug');
    const p = await prisma.blogPost.findFirst({ where: { slug, status: 'PUBLISHED' } });
    if (!p) throw new HTTPException(404, { message: 'Blog post not found' });
    const body: BlogPostPublic = {
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      coverImageUrl: p.coverImageUrl,
      author: p.author,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      body: p.body,
    };
    return c.json(body);
  });

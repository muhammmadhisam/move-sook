import { Hono } from 'hono';
import { getPublishedPost, listPublishedPosts } from '@movesook/services/blog';
import type { AppEnv } from '../lib/context';

// Public marketing blog (no auth). Handlers are thin wrappers over
// @movesook/services/blog. Only PUBLISHED posts are ever exposed here —
// drafts are admin-only (writes live in routes/admin.ts).
export const blogRoutes = new Hono<AppEnv>()
  // List published posts, newest first (blog index + sitemap).
  .get('/', async (c) => c.json(await listPublishedPosts()))
  // One published post by slug (full Markdown body).
  .get('/:slug', async (c) => c.json(await getPublishedPost(c.req.param('slug'))));

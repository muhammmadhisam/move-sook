// DB-backed marketing blog. Posts are authored in the admin app (BlogPost
// table) and served by the API's public /blog routes. These helpers wrap the
// type-safe API client so the index, [slug] page, and sitemap share one source.
import { api } from './api';
import type { BlogPostPublic, BlogPostSummary } from '@movesook/shared';

export type { BlogPostPublic, BlogPostSummary };

/** All published posts, newest first. Returns [] if the API is unreachable. */
export async function getBlogPosts(): Promise<BlogPostSummary[]> {
  try {
    const res = await api.blog.$get();
    if (!res.ok) return [];
    const data = (await res.json()) as { items: BlogPostSummary[] };
    return data.items;
  } catch {
    return [];
  }
}

/** One published post by slug, or null if not found / unpublished. */
export async function getBlogPost(slug: string): Promise<BlogPostPublic | null> {
  try {
    const res = await api.blog[':slug'].$get({ param: { slug } });
    if (!res.ok) return null;
    return (await res.json()) as BlogPostPublic;
  } catch {
    return null;
  }
}

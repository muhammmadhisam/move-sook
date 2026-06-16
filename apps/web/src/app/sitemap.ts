import type { MetadataRoute } from 'next';
import { SITE, MARKETING_ROUTES } from '@/lib/site';
import { getBlogPosts } from '@/lib/blog';

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes = MARKETING_ROUTES.map((r) => ({
    url: `${SITE.url}${r.path === '/' ? '' : r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const posts = await getBlogPosts();
  const blogRoutes = posts.map((post) => ({
    url: `${SITE.url}/blog/${post.slug}`,
    lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...blogRoutes];
}

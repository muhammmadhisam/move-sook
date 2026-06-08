import type { MetadataRoute } from 'next';
import { SITE, MARKETING_ROUTES } from '@/lib/site';
import { BLOG_POSTS } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = MARKETING_ROUTES.map((r) => ({
    url: `${SITE.url}${r.path === '/' ? '' : r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const blogRoutes = BLOG_POSTS.map((post) => ({
    url: `${SITE.url}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...blogRoutes];
}

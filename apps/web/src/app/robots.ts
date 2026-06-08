import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep the authenticated app + auth flow out of the index.
        disallow: ['/app', '/jobs', '/my-jobs', '/active', '/notifications', '/profile', '/driver', '/referral', '/login'],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}

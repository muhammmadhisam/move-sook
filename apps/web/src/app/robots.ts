import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep the authenticated app + auth flow out of the index. All
        // authenticated pages now live under /app, so one prefix covers them.
        // (The old per-route list also prefix-matched the marketing /drivers
        // page via '/driver', wrongly blocking it from the index.)
        disallow: ['/app', '/login'],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}

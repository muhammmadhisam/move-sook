import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { JsonLd } from '@/components/marketing/json-ld';
import { SITE } from '@/lib/site';

const orgLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  alternateName: SITE.nameTh,
  url: SITE.url,
  logo: `${SITE.url}/brand-mark.png`,
  email: SITE.email,
  description: SITE.description,
  areaServed: { '@type': 'Country', name: 'Thailand' },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SITE.email,
    availableLanguage: ['th', 'en'],
  },
};

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: SITE.url,
  inLanguage: 'th-TH',
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={[orgLd, websiteLd]} />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

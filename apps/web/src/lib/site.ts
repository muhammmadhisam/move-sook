// Central site metadata — single source of truth for SEO, sitemap, JSON-LD,
// and marketing copy. Override the URL per-environment via NEXT_PUBLIC_SITE_URL.
export const SITE = {
  name: 'MoveSook',
  nameTh: 'มูฟสุข',
  tagline: 'เรียกคนขับขนย้ายใกล้คุณ',
  description:
    'MoveSook (มูฟสุข) แพลตฟอร์มเรียกรถขนย้าย โพสต์งานขนย้าย แล้วให้คนขับที่อยู่ใกล้และว่างรับงาน ราคาโปร่งใส ปลอดภัย ติดตามสถานะได้แบบเรียลไทม์',
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://movesook.com').replace(/\/$/, ''),
  email: 'support@movesook.com',
  phone: '+66-2-000-0000',
  lineOaUrl: 'https://line.me/R/ti/p/@movesook',
  commissionPct: 12,
} as const;

// Marketing routes that belong in the sitemap (public, indexable).
export const MARKETING_ROUTES = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' as const },
  { path: '/how-it-works', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/drivers', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/about', priority: 0.7, changeFrequency: 'monthly' as const },
  { path: '/faq', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/contact', priority: 0.6, changeFrequency: 'yearly' as const },
  { path: '/blog', priority: 0.7, changeFrequency: 'weekly' as const },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
];

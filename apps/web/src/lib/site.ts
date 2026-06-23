// Central site metadata — single source of truth for SEO, sitemap, JSON-LD,
// and marketing copy. Override the URL per-environment via NEXT_PUBLIC_SITE_URL.
export const SITE = {
  name: "MoveSook",
  nameTh: "มูฟสุข",
  tagline: "เรียกคนขับขนย้ายใกล้คุณ",
  description:
    "MoveSook (มูฟสุข) แพลตฟอร์มเรียกรถขนย้าย โพสต์งานขนย้าย แล้วให้คนขับที่อยู่ใกล้และว่างรับงาน ราคาโปร่งใส ปลอดภัย ติดตามสถานะได้แบบเรียลไทม์",
  // Tolerate a bare hostname in NEXT_PUBLIC_SITE_URL (e.g. "movesook.samdev.cloud"):
  // metadataBase/new URL() require a protocol, so default to https:// if none is given.
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://movesook.com")
    .replace(/\/$/, "")
    .replace(/^(?!https?:\/\/)/, "https://"),
  email: "support@movesook.com",
  phone: "+66090-224-4336",
  lineOaUrl: "https://line.me/R/ti/p/@013ogbsz",
  lineMiniAppUrl: "https://miniapp.line.me/2010389451-oorWbPjK",
  commissionPct: 12,
  // Fallback flat starting fare (THB) when GET /system/public is unreachable;
  // the live value comes from admin settings (AppSetting `base_fare`).
  baseFare: 250,
} as const;

// Build a LINE Mini App deep link. Inside LINE the Mini App runs in a logged-in
// LIFF context (no external OAuth round-trip), so app-entry CTAs point here. An
// optional in-app path (e.g. "/driver/apply") is appended after the LIFF id so
// the Mini App opens directly on that screen.
export function lineMiniAppLink(path = ""): string {
  const base = SITE.lineMiniAppUrl.replace(/\/$/, "");
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// Marketing routes that belong in the sitemap (public, indexable).
export const MARKETING_ROUTES = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/how-it-works", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/drivers", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/faq", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/contact", priority: 0.6, changeFrequency: "yearly" as const },
  { path: "/blog", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
];

// Province slug registry for the programmatic-SEO `/move/[province]` pages.
// Slugs are ASCII (from name_en) so URLs stay shareable; the Thai name drives
// all on-page copy + metadata. Source list is the same `@movesook/thailand-provinces`
// data used for address pickers and origin/serviceProvince matching.
import { getProvinces } from '@movesook/thailand-provinces';

export type ProvinceEntry = { slug: string; nameTh: string; nameEn: string };

// "Narathiwat" -> "narathiwat", "Nakhon Si Thammarat" -> "nakhon-si-thammarat"
export const PROVINCES: ProvinceEntry[] = getProvinces().map((p) => ({
  slug: p.name_en.toLowerCase().replace(/\s+/g, '-'),
  nameTh: p.name_th,
  nameEn: p.name_en,
}));

const bySlug = new Map(PROVINCES.map((p) => [p.slug, p]));

export function getProvinceBySlug(slug: string): ProvinceEntry | undefined {
  return bySlug.get(slug);
}

// High-demand provinces surfaced on the homepage as internal links into the
// programmatic `/move/[province]` pages (helps crawl + ranks the area pages).
const POPULAR_NAMES_TH = [
  'กรุงเทพมหานคร',
  'นนทบุรี',
  'สมุทรปราการ',
  'ปทุมธานี',
  'เชียงใหม่',
  'ชลบุรี',
  'ภูเก็ต',
  'นครราชสีมา',
  'ขอนแก่น',
  'สงขลา',
  'สุราษฎร์ธานี',
  'เชียงราย',
];

export const POPULAR_PROVINCES: ProvinceEntry[] = POPULAR_NAMES_TH.map((th) =>
  PROVINCES.find((p) => p.nameTh === th),
).filter((p): p is ProvinceEntry => Boolean(p));

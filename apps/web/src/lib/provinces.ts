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

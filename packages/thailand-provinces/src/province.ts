import Provinces from "./raw/thai_provinces.json";
import { type Option, type Province, none, some } from "./types";

const provinceMap = new Map(
  Provinces.RECORDS.map((p) => [
    p.id,
    {
      id: p.id,
      name_th: p.name_th,
      name_en: p.name_en,
      geography_id: p.geography_id,
    },
  ])
);

const provinceList: Province[] = Provinces.RECORDS.map((p) => ({
  id: p.id,
  name_th: p.name_th,
  name_en: p.name_en,
  geography_id: p.geography_id,
}));

export function getProvinceByProvinceId(id: number): Option<Province> {
  const province = provinceMap.get(id);
  if (!province) return none();
  return some(province);
}

export function getProvinces(): Province[] {
  return provinceList;
}

/**
 * Normalises a free-form province name (e.g. from a map geocoder, which may
 * return Thai or English, with/without a "จังหวัด"/"Province" affix) to the
 * canonical `name_th` used across the system. Returns null when no province
 * matches, so callers can fall back to manual selection.
 */
export function matchProvinceName(input: string): string | null {
  const cleaned = input
    .trim()
    .replace(/^จังหวัด/, "")
    .replace(/\s+province$/i, "")
    .trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  for (const p of provinceList) {
    if (p.name_th === cleaned || p.name_en.toLowerCase() === lower) {
      return p.name_th;
    }
  }
  return null;
}

import Amphures from "./raw/thai_amphures.json";
import { type Amphure, type Option, none, some } from "./types";

const amphureMap = new Map(
  Amphures.RECORDS.map((a) => [
    a.id,
    {
      id: a.id,
      name_th: a.name_th,
      name_en: a.name_en,
      province_id: a.province_id,
    },
  ])
);

const amphuresByProvince = new Map<number, Amphure[]>();
Amphures.RECORDS.forEach((a) => {
  const list = amphuresByProvince.get(a.province_id) ?? [];
  list.push({ id: a.id, name_th: a.name_th, name_en: a.name_en, province_id: a.province_id });
  amphuresByProvince.set(a.province_id, list);
});

export function getAmphureByAmphureId(id: number): Option<Amphure> {
  const amphure = amphureMap.get(id);
  if (!amphure) return none();
  return some(amphure);
}

export function getAmphuresByProvinceId(provinceId: number): Amphure[] {
  return amphuresByProvince.get(provinceId) ?? [];
}

import { binarySearchByZipCode } from "./bs-filter";
import tambons from "./raw/thai_tambons.json";
import ZipCodeGroup from "./raw/zip_code_to_tambon_group.json";
import { type Option, type Tambon, type ZipCode, none, some } from "./types";

const tambonsMap = new Map<number, Tambon>(
  tambons.RECORDS.map((t) => {
    return [
      t.id,
      {
        id: t.id,
        zip_code: t.zip_code,
        name_th: t.name_th,
        name_en: t.name_en,
        amphure_id: t.amphure_id,
      },
    ];
  })
);

const tambonsByAmphure = new Map<number, Tambon[]>();
tambons.RECORDS.forEach((t) => {
  const list = tambonsByAmphure.get(t.amphure_id) ?? [];
  list.push({
    id: t.id,
    zip_code: t.zip_code,
    name_th: t.name_th,
    name_en: t.name_en,
    amphure_id: t.amphure_id,
  });
  tambonsByAmphure.set(t.amphure_id, list);
});

const zipCodeGroupMap = new Map<number, Tambon[]>();
Object.entries(ZipCodeGroup).forEach(([k, v]) => {
  zipCodeGroupMap.set(Number.parseInt(k), v as unknown as Tambon[]);
});

export function getTambonByTambonId(id: number): Option<Tambon> {
  const tb = tambonsMap.get(id);
  if (!tb) return none();
  return some(tb);
}

export function getTambonsByAmphureId(amphureId: number): Tambon[] {
  return tambonsByAmphure.get(amphureId) ?? [];
}

export function getTambonGroupFromZipCode(zipcode: number): Option<Tambon[]> {
  const tp = zipCodeGroupMap.get(zipcode);
  if (!tp) return none();
  return some(tp);
}

export function getTambonsIdListFromZipCode(
  zipCodeList: ZipCode[],
  targetZipCode: number
): ZipCode[] {
  return binarySearchByZipCode(zipCodeList, "zip_code", targetZipCode);
}

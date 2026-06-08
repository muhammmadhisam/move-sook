import { z } from 'zod';
import { getProvinces } from '@movesook/thailand-provinces/province';

// Canonical set of Thai province names (name_th). This is the system-wide
// source of truth: provinces are stored as these exact strings so the
// on-demand driver/job matching (originProvince === serviceProvince) is a
// reliable exact-string comparison. Built once at module load.
export const THAI_PROVINCE_NAMES: readonly string[] = getProvinces()
  .map((p) => p.name_th)
  .sort((a, b) => a.localeCompare(b, 'th'));

const provinceNameSet = new Set(THAI_PROVINCE_NAMES);

export function isValidProvinceName(value: string): boolean {
  return provinceNameSet.has(value);
}

// A required Thai province name, validated against the canonical set.
export const ProvinceNameSchema = z
  .string()
  .refine(isValidProvinceName, { message: 'จังหวัดไม่ถูกต้อง' });

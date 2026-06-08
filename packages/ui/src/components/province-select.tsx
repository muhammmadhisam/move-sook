'use client';

import { getProvinces } from '@movesook/thailand-provinces/province';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

// Canonical, sorted list of Thai provinces (value = name_th, the string stored
// across the system so on-demand province matching stays exact-string).
const PROVINCES = getProvinces()
  .map((p) => ({ value: p.name_th, label: p.name_th, labelEn: p.name_en }))
  .sort((a, b) => a.label.localeCompare(b.label, 'th'));

export interface ProvinceSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Restrict the options to this set of `name_th` values (e.g. active service areas). */
  allow?: readonly string[];
}

/**
 * Constrains province entry to a real Thai province (`name_th`). Replaces
 * free-text inputs so a typo can never silently break driver/job matching.
 * Pass `allow` to further narrow the list to served provinces.
 */
export function ProvinceSelect({
  value,
  onChange,
  placeholder = 'เลือกจังหวัด',
  disabled,
  id,
  className,
  allow,
}: ProvinceSelectProps) {
  const options = allow ? PROVINCES.filter((p) => allow.includes(p.value)) : PROVINCES;
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

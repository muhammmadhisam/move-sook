// Server-side reads of the public system config (GET /system/public) for
// marketing pages. Falls back to the static SITE value when the API is
// unreachable so pages still render with a sensible number.
import { api } from './api';
import { SITE } from './site';
import type { PublicSystemConfig } from '@movesook/shared';

/** The full public system config (GET /system/public), or null if unreachable. */
export async function getPublicConfig(): Promise<PublicSystemConfig | null> {
  try {
    const res = await api.system.public.$get();
    if (!res.ok) return null;
    return (await res.json()) as PublicSystemConfig;
  } catch {
    return null;
  }
}

/** Current platform commission rate (%), from admin settings. */
export async function getCommissionPct(): Promise<number> {
  const cfg = await getPublicConfig();
  return cfg?.commissionPct ?? SITE.commissionPct;
}

/** Flat starting fare (THB) applied before per-km, from admin settings. */
export async function getBaseFare(): Promise<number> {
  const cfg = await getPublicConfig();
  return cfg?.baseFare ?? SITE.baseFare;
}

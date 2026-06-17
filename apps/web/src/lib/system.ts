// Server-side reads of the public system config (GET /system/public) for
// marketing pages. Falls back to the static SITE value when the API is
// unreachable so pages still render with a sensible number.
import { api } from './api';
import { SITE } from './site';
import type { PublicSystemConfig } from '@movesook/shared';

/** Current platform commission rate (%), from admin settings. */
export async function getCommissionPct(): Promise<number> {
  try {
    const res = await api.system.public.$get();
    if (!res.ok) return SITE.commissionPct;
    const cfg = (await res.json()) as PublicSystemConfig;
    return cfg.commissionPct;
  } catch {
    return SITE.commissionPct;
  }
}

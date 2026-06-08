import { prisma } from '@movesook/db';
import { getSurgeEnabled, getSurgeMultiplier } from './settings';

export type Surge = { active: boolean; multiplier: number };

const NO_SURGE: Surge = { active: false, multiplier: 1 };

/**
 * Demand-based surge for an origin province. When surge is enabled and the
 * province is UNDERSERVED (open unassigned jobs outstrip available approved
 * drivers — same rule as the supply/demand report), the configured multiplier
 * applies; otherwise no surge. Mirrors `classify()` in the supply/demand route.
 */
export async function getSurge(province: string | null | undefined): Promise<Surge> {
  if (!province) return NO_SURGE;
  if (!(await getSurgeEnabled())) return NO_SURGE;

  const [openJobs, availableDrivers] = await Promise.all([
    prisma.job.count({ where: { status: 'POSTED', driverId: null, originProvince: province } }),
    prisma.driver.count({
      where: { verifyStatus: 'APPROVED', isAvailable: true, serviceProvince: province },
    }),
  ]);

  if (openJobs === 0) return NO_SURGE;
  const underserved = availableDrivers === 0 || openJobs / availableDrivers >= 2;
  if (!underserved) return NO_SURGE;

  return { active: true, multiplier: await getSurgeMultiplier() };
}

import { prisma } from '@movesook/db';
import { writeAudit } from '@movesook/services/support';
import type {
  AdminSetServiceAreaInput,
  ServiceAreaDto,
} from '@movesook/shared';

/** Service areas (active provinces) — list. */
export async function listServiceAreas(): Promise<{ items: ServiceAreaDto[] }> {
  const rows = await prisma.serviceArea.findMany({ orderBy: { province: 'asc' } });
  const items: ServiceAreaDto[] = rows.map((r) => ({ province: r.province, isActive: r.isActive }));
  return { items };
}

/** Active service-area province names only — for the public marketing site (no auth). */
export async function listPublicServiceAreas(): Promise<{ provinces: string[] }> {
  const rows = await prisma.serviceArea.findMany({
    where: { isActive: true },
    orderBy: { province: 'asc' },
    select: { province: true },
  });
  return { provinces: rows.map((r) => r.province) };
}

/** Toggle a province's service area. */
export async function setServiceArea(
  sub: string,
  input: AdminSetServiceAreaInput,
): Promise<ServiceAreaDto> {
  const { province, isActive } = input;
  const row = await prisma.serviceArea.upsert({
    where: { province },
    create: { province, isActive },
    update: { isActive },
  });
  await writeAudit({
    actorId: sub,
    action: 'settings.service_area',
    targetType: 'setting',
    targetId: province,
    metadata: { isActive },
  });
  return { province: row.province, isActive: row.isActive };
}

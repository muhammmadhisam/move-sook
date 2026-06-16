import { prisma, type Prisma } from '@movesook/db';
import { pageArgs, writeAudit } from '@movesook/services/support';
import type {
  AdminListBlacklistQuery,
  AdminCreateBlacklistInput,
  BlacklistDto,
} from '@movesook/shared';

export type BlacklistListResponse = {
  items: BlacklistDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Blacklist (block re-registration by national ID / plate) — list. */
export async function listBlacklist(
  q: AdminListBlacklistQuery,
): Promise<BlacklistListResponse> {
  const where: Prisma.BlacklistWhereInput = q.search
    ? { OR: [{ nationalId: { contains: q.search } }, { plateNumber: { contains: q.search } }] }
    : {};
  const [rows, total] = await Promise.all([
    prisma.blacklist.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.blacklist.count({ where }),
  ]);
  const items: BlacklistDto[] = rows.map((b) => ({
    id: b.id,
    nationalId: b.nationalId,
    plateNumber: b.plateNumber,
    reason: b.reason,
    createdAt: b.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Add a blacklist entry. */
export async function createBlacklist(
  sub: string,
  input: AdminCreateBlacklistInput,
): Promise<BlacklistDto> {
  const row = await prisma.blacklist.create({
    data: {
      nationalId: input.nationalId ?? null,
      plateNumber: input.plateNumber ?? null,
      reason: input.reason ?? null,
      createdById: sub,
    },
  });
  await writeAudit({
    actorId: sub,
    action: 'blacklist.add',
    targetType: 'driver',
    targetId: row.id,
    metadata: { nationalId: input.nationalId ?? null, plateNumber: input.plateNumber ?? null },
  });
  return {
    id: row.id,
    nationalId: row.nationalId,
    plateNumber: row.plateNumber,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Remove a blacklist entry. */
export async function removeBlacklist(
  sub: string,
  id: string,
): Promise<{ id: string; removed: true }> {
  await prisma.blacklist.deleteMany({ where: { id } });
  await writeAudit({ actorId: sub, action: 'blacklist.remove', targetType: 'driver', targetId: id });
  return { id, removed: true };
}

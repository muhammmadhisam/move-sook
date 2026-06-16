import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import { pageArgs, orderByOf, writeAudit } from '@movesook/services/support';
import type {
  AdminListPromosQuery,
  AdminListPromoRedemptionsQuery,
  AdminCreatePromoInput,
  AdminUpdatePromoInput,
  PromoCodeDto,
  PromoRedemptionDto,
} from '@movesook/shared';

export type PromoListResponse = {
  items: PromoCodeDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type PromoRedemptionListResponse = {
  items: PromoRedemptionDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Promo codes (list). */
export async function listPromos(q: AdminListPromosQuery): Promise<PromoListResponse> {
  const [rows, total] = await Promise.all([
    prisma.promoCode.findMany({
      orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'code', 'usedCount'], 'createdAt'),
      ...pageArgs(q),
    }),
    prisma.promoCode.count(),
  ]);
  const items: PromoCodeDto[] = rows.map((p) => ({
    code: p.code,
    type: p.type,
    value: p.value,
    minOrder: p.minOrder,
    maxUses: p.maxUses,
    usedCount: p.usedCount,
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/**
 * Per-code redemption log: which jobs (and customers) used a promo, and when.
 * Derived from Job.promoCode — there is no separate redemption table.
 */
export async function listPromoRedemptions(
  code: string,
  q: AdminListPromoRedemptionsQuery,
): Promise<PromoRedemptionListResponse> {
  const upper = code.toUpperCase();
  const where = { promoCode: upper };
  const [rows, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: q.sortDir === 'asc' ? 'asc' : 'desc' },
      include: { customer: { select: { name: true, user: { select: { displayName: true } } } } },
      ...pageArgs(q),
    }),
    prisma.job.count({ where }),
  ]);
  const items: PromoRedemptionDto[] = rows.map((j) => ({
    jobId: j.id,
    customerId: j.customerId,
    customerName: j.customer.name ?? j.customer.user?.displayName ?? null,
    status: j.status,
    priceQuoted: j.priceQuoted,
    discountAmount: j.discountAmount,
    createdAt: j.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Create a promo code. */
export async function createPromo(
  sub: string,
  input: AdminCreatePromoInput,
): Promise<PromoCodeDto> {
  const code = input.code.trim().toUpperCase();
  const existing = await prisma.promoCode.findUnique({ where: { code } });
  if (existing) throw new HTTPException(409, { message: 'Promo code already exists' });
  const row = await prisma.promoCode.create({
    data: {
      code,
      type: input.type,
      value: input.value,
      minOrder: input.minOrder ?? null,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
  await writeAudit({ actorId: sub, action: 'promo.create', targetType: 'setting', targetId: code });
  return {
    code: row.code,
    type: row.type,
    value: row.value,
    minOrder: row.minOrder,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Update a promo code. */
export async function updatePromo(
  sub: string,
  code: string,
  input: AdminUpdatePromoInput,
): Promise<PromoCodeDto> {
  const upper = code.toUpperCase();
  const existing = await prisma.promoCode.findUnique({ where: { code: upper } });
  if (!existing) throw new HTTPException(404, { message: 'Promo not found' });
  const row = await prisma.promoCode.update({
    where: { code: upper },
    data: {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.minOrder !== undefined ? { minOrder: input.minOrder } : {}),
      ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    },
  });
  await writeAudit({ actorId: sub, action: 'promo.update', targetType: 'setting', targetId: upper });
  return {
    code: row.code,
    type: row.type,
    value: row.value,
    minOrder: row.minOrder,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

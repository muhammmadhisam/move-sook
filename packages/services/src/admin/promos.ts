import { HTTPException } from 'hono/http-exception';
import { prisma, type Prisma } from '@movesook/db';
import { pageArgs, orderByOf, writeAudit } from '@movesook/services/support';
import type {
  AdminListPromosQuery,
  AdminListPromoRedemptionsQuery,
  AdminCreatePromoInput,
  AdminUpdatePromoInput,
  PromoCodeDto,
  PromoRedemptionDto,
} from '@movesook/shared';

// Pull a promo row together with its (optional) customer whitelist.
const promoInclude = {
  customers: { include: { customer: { select: { id: true, name: true, phone: true } } } },
} satisfies Prisma.PromoCodeInclude;

type PromoRow = Prisma.PromoCodeGetPayload<{ include: typeof promoInclude }>;

function toPromoDto(p: PromoRow): PromoCodeDto {
  return {
    code: p.code,
    type: p.type,
    value: p.value,
    minOrder: p.minOrder,
    maxUses: p.maxUses,
    usedCount: p.usedCount,
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    customers: p.customers.map((c) => ({
      id: c.customer.id,
      name: c.customer.name,
      phone: c.customer.phone,
    })),
  };
}

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
      include: promoInclude,
      ...pageArgs(q),
    }),
    prisma.promoCode.count(),
  ]);
  const items: PromoCodeDto[] = rows.map(toPromoDto);
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
  const customerIds = await validCustomerIds(input.customerIds);
  const row = await prisma.promoCode.create({
    data: {
      code,
      type: input.type,
      value: input.value,
      minOrder: input.minOrder ?? null,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
      customers: { create: customerIds.map((customerId) => ({ customerId })) },
    },
    include: promoInclude,
  });
  await writeAudit({
    actorId: sub,
    action: 'promo.create',
    targetType: 'setting',
    targetId: code,
    metadata: { restrictedTo: customerIds.length },
  });
  return toPromoDto(row);
}

/**
 * De-dupe the requested customer ids and keep only those that exist. Silently
 * dropping unknown ids keeps a stale picker selection from 500-ing; an entirely
 * unknown list yields an empty whitelist (i.e. a public code), which is safe.
 */
async function validCustomerIds(ids: string[] | undefined): Promise<string[]> {
  if (!ids || ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const rows = await prisma.customer.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
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
  // Replace the whitelist wholesale only when customerIds was supplied (omit = leave
  // as-is; [] = clear → public). Done in a tx so the swap is atomic.
  const replaceWhitelist = input.customerIds !== undefined;
  const customerIds = replaceWhitelist ? await validCustomerIds(input.customerIds) : [];
  const row = await prisma.$transaction(async (tx) => {
    if (replaceWhitelist) {
      await tx.promoCodeCustomer.deleteMany({ where: { promoCode: upper } });
      if (customerIds.length > 0) {
        await tx.promoCodeCustomer.createMany({
          data: customerIds.map((customerId) => ({ promoCode: upper, customerId })),
        });
      }
    }
    return tx.promoCode.update({
      where: { code: upper },
      data: {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.minOrder !== undefined ? { minOrder: input.minOrder } : {}),
        ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      },
      include: promoInclude,
    });
  });
  await writeAudit({
    actorId: sub,
    action: 'promo.update',
    targetType: 'setting',
    targetId: upper,
    ...(replaceWhitelist ? { metadata: { restrictedTo: customerIds.length } } : {}),
  });
  return toPromoDto(row);
}

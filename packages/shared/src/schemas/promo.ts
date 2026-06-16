import { z } from 'zod';
import { JobStatusSchema, PromoTypeSchema } from '../enums';
import { PageQuery } from './pagination';

export const PromoCodeDto = z.object({
  code: z.string(),
  type: PromoTypeSchema,
  value: z.number().int(),
  minOrder: z.number().int().nullable(),
  maxUses: z.number().int().nullable(),
  usedCount: z.number().int(),
  expiresAt: z.string().datetime().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type PromoCodeDto = z.infer<typeof PromoCodeDto>;

export const AdminListPromosQuery = PageQuery;
export type AdminListPromosQuery = z.infer<typeof AdminListPromosQuery>;

/** One job that redeemed a given promo code — who used it, when, and how much. */
export const PromoRedemptionDto = z.object({
  jobId: z.string(),
  customerId: z.string(),
  customerName: z.string().nullable(),
  status: JobStatusSchema,
  priceQuoted: z.number().int().nullable(),
  discountAmount: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});
export type PromoRedemptionDto = z.infer<typeof PromoRedemptionDto>;

export const AdminListPromoRedemptionsQuery = PageQuery;
export type AdminListPromoRedemptionsQuery = z.infer<typeof AdminListPromoRedemptionsQuery>;

export const AdminCreatePromoInput = z.object({
  code: z.string().min(2).max(40),
  type: PromoTypeSchema,
  value: z.number().int().min(1),
  minOrder: z.number().int().min(0).optional(),
  maxUses: z.number().int().min(1).optional(),
  expiresAt: z.coerce.date().optional(),
});
export type AdminCreatePromoInput = z.infer<typeof AdminCreatePromoInput>;

export const AdminUpdatePromoInput = z.object({
  isActive: z.boolean().optional(),
  value: z.number().int().min(1).optional(),
  minOrder: z.number().int().min(0).nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});
export type AdminUpdatePromoInput = z.infer<typeof AdminUpdatePromoInput>;

/** Pure discount math — single source of truth. Caps the discount at the price. */
export function computeDiscount(
  price: number,
  type: 'PERCENT' | 'FIXED',
  value: number,
): number {
  if (price <= 0) return 0;
  const raw = type === 'PERCENT' ? Math.round((price * value) / 100) : value;
  return Math.min(raw, price);
}

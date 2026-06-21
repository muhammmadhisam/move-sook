import { z } from 'zod';
import { JobStatusSchema, PromoTypeSchema, type PromoType } from '../enums';
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

export const AdminCreatePromoInput = z
  .object({
    code: z.string().min(2).max(40),
    type: PromoTypeSchema,
    // PERCENT: 1..100. FIXED: THB off. FIXED_PRICE: the locked total price (THB).
    value: z.number().int().min(1),
    minOrder: z.number().int().min(0).optional(),
    maxUses: z.number().int().min(1).optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((v) => v.type !== 'PERCENT' || v.value <= 100, {
    message: 'ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100',
    path: ['value'],
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

/** Pure discount math — single source of truth. Caps the discount into [0, price].
 *  PERCENT: value% off. FIXED: `value` THB off. FIXED_PRICE: lock the total to
 *  `value` THB — the discount is whatever brings the subtotal down to that price,
 *  and it never increases the price (a locked price above the quote yields no discount). */
export function computeDiscount(price: number, type: PromoType, value: number): number {
  if (price <= 0) return 0;
  let raw: number;
  switch (type) {
    case 'PERCENT':
      raw = Math.round((price * value) / 100);
      break;
    case 'FIXED':
      raw = value;
      break;
    case 'FIXED_PRICE':
      raw = price - value;
      break;
  }
  return Math.max(0, Math.min(raw, price));
}

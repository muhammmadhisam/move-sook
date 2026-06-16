import { prisma, type PromoCode } from '@movesook/db';
import { computeDiscount } from '@movesook/shared';

export type PromoEvaluation =
  | { ok: true; promo: PromoCode; discount: number }
  | { ok: false; reason: string }; // Thai-facing rejection reason

/**
 * Validate a promo code against a subtotal and compute its discount. Returns
 * `null` when no code was supplied (the common case). On success the caller is
 * responsible for incrementing `usedCount` inside the job-creation transaction;
 * the estimate endpoint uses the same evaluation purely as a preview.
 */
export async function evaluatePromo(
  code: string | undefined | null,
  subtotal: number,
): Promise<PromoEvaluation | null> {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  const promo = await prisma.promoCode.findUnique({ where: { code: normalized } });
  if (!promo) return { ok: false, reason: 'ไม่พบโค้ดส่วนลดนี้' };
  if (!promo.isActive) return { ok: false, reason: 'โค้ดส่วนลดถูกปิดใช้งาน' };
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'โค้ดส่วนลดหมดอายุแล้ว' };
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    return { ok: false, reason: 'โค้ดส่วนลดถูกใช้ครบจำนวนแล้ว' };
  }
  if (promo.minOrder != null && subtotal < promo.minOrder) {
    return { ok: false, reason: `ต้องมียอดขั้นต่ำ ฿${promo.minOrder.toLocaleString()} จึงใช้โค้ดนี้ได้` };
  }
  return { ok: true, promo, discount: computeDiscount(subtotal, promo.type, promo.value) };
}

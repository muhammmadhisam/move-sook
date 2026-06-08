import { randomBytes } from 'node:crypto';
import { prisma, type Customer } from '@movesook/db';
import { notify } from './notify';
import { getSystemSettings } from './settings';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** Ensure a customer has a unique referral code, generating one lazily. */
export async function ensureReferralCode(customer: Pick<Customer, 'id' | 'referralCode'>): Promise<string> {
  if (customer.referralCode) return customer.referralCode;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode(6);
    const clash = await prisma.customer.findUnique({ where: { referralCode: code } });
    if (clash) continue;
    try {
      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: { referralCode: code },
      });
      return updated.referralCode!;
    } catch {
      // Unique-constraint race: retry with a new code.
    }
  }
  throw new Error('could not allocate referral code');
}

/** Create a one-time FIXED promo code worth the referral reward and return it. */
async function createRewardPromo(rewardThb: number): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `REF${randomCode(6)}`;
    try {
      await prisma.promoCode.create({
        data: { code, type: 'FIXED', value: rewardThb, maxUses: 1, minOrder: 0 },
      });
      return code;
    } catch {
      // code collision — retry
    }
  }
  throw new Error('could not allocate reward promo');
}

/**
 * Best-effort two-sided referral reward, issued the first time a referred
 * customer has a job confirmed DELIVERED. Idempotent via `referralRewardedAt`
 * (a conditional update wins the race). Runs AFTER the delivery transaction
 * commits so a failure here never blocks delivery confirmation.
 */
export async function maybeIssueReferralReward(customerId: string): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || !customer.referredById || customer.referralRewardedAt) return;

    // Claim the reward slot atomically; if 0 rows updated, another path already did it.
    const claim = await prisma.customer.updateMany({
      where: { id: customerId, referralRewardedAt: null, referredById: { not: null } },
      data: { referralRewardedAt: new Date() },
    });
    if (claim.count === 0) return;

    const referrer = await prisma.customer.findUnique({ where: { id: customer.referredById } });

    const rewardThb = (await getSystemSettings()).referralRewardThb;
    const [refereeCode, referrerCode] = await Promise.all([
      createRewardPromo(rewardThb),
      createRewardPromo(rewardThb),
    ]);

    // Notify both sides with their personal one-time code (only linked app users).
    if (customer.userId) {
      await notify({
        userId: customer.userId,
        type: 'GENERIC',
        title: 'รับส่วนลดจากการแนะนำเพื่อน 🎉',
        body: `ขอบคุณที่ใช้บริการ! ใช้โค้ด ${refereeCode} รับส่วนลด ฿${rewardThb} งานถัดไป`,
      });
    }
    if (referrer?.userId) {
      await notify({
        userId: referrer.userId,
        type: 'GENERIC',
        title: 'เพื่อนที่คุณแนะนำใช้งานสำเร็จแล้ว 🎉',
        body: `ใช้โค้ด ${referrerCode} รับส่วนลด ฿${rewardThb} เป็นรางวัลการแนะนำ`,
      });
    }
  } catch (err) {
    console.error('[referral] reward issuance failed', customerId, err);
  }
}

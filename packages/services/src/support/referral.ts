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

/**
 * Idempotently grant the two-sided referral reward, the first time a referred
 * customer has a job confirmed DELIVERED. Runs in the side-effects worker (so it
 * gets retry/backoff). Enqueued via `maybeIssueReferralReward` after the delivery
 * transaction commits, so it never blocks delivery confirmation.
 *
 * The claim of `referralRewardedAt` and the creation of BOTH reward promos happen
 * in one transaction: a failure rolls the claim back so a retry re-grants cleanly.
 * (The previous version claimed the slot first, then created the codes outside any
 * transaction — a mid-way crash consumed the claim and lost the codes forever,
 * because the idempotency guard then blocked every retry.)
 */
export async function runReferralRewardGrant(customerId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || !customer.referredById || customer.referralRewardedAt) return;

  const referrer = await prisma.customer.findUnique({ where: { id: customer.referredById } });
  const rewardThb = (await getSystemSettings()).referralRewardThb;

  // Codes are generated outside the tx; a (very rare) collision aborts the tx and
  // the job retries with fresh codes — no in-tx catch-and-continue needed.
  const refereeCode = `REF${randomCode(6)}`;
  const referrerCode = `REF${randomCode(6)}`;

  const granted = await prisma.$transaction(async (tx) => {
    // Claim the reward slot atomically; if 0 rows updated, another run already did it.
    const claim = await tx.customer.updateMany({
      where: { id: customerId, referralRewardedAt: null, referredById: { not: null } },
      data: { referralRewardedAt: new Date() },
    });
    if (claim.count === 0) return false;
    await tx.promoCode.create({
      data: { code: refereeCode, type: 'FIXED', value: rewardThb, maxUses: 1, minOrder: 0 },
    });
    await tx.promoCode.create({
      data: { code: referrerCode, type: 'FIXED', value: rewardThb, maxUses: 1, minOrder: 0 },
    });
    return true;
  });
  if (!granted) return;

  // Notify both sides with their personal one-time code (only linked app users).
  // notify() never throws, so a notification hiccup won't retry an already-granted
  // reward; the codes are durably in PromoCode regardless.
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
}

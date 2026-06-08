import type { Job, Prisma, Transaction } from '@movesook/db';
import { DEFAULT_COMMISSION_PCT, computeCommission } from '@movesook/shared';

/**
 * Create the commission ledger entry for a delivered job. Idempotent: returns
 * `null` if the job has no driver/price or a transaction already exists; otherwise
 * returns the created row. Must run inside the same prisma transaction that flips
 * the job to DELIVERED.
 */
export async function createDeliveryTransaction(
  tx: Prisma.TransactionClient,
  job: Job,
): Promise<Transaction | null> {
  if (!job.driverId || job.priceQuoted == null) return null;

  const existing = await tx.transaction.findUnique({ where: { jobId: job.id } });
  if (existing) return null;

  const commissionPct = job.commissionPct ?? DEFAULT_COMMISSION_PCT;
  const { commissionAmount, netToDriver } = computeCommission(job.priceQuoted, commissionPct);

  return tx.transaction.create({
    data: {
      jobId: job.id,
      driverId: job.driverId,
      grossAmount: job.priceQuoted,
      commissionPct,
      commissionAmount,
      netToDriver,
    },
  });
}

/**
 * Attach a freshly-created delivery transaction to the driver's open (PENDING)
 * payout — creating that payout if none exists. This makes the driver's amount
 * appear on the admin "ธุรกรรมกับคนขับ" page immediately on delivery, ready to be
 * marked paid (with slip + reference), without the admin manually creating a
 * payout round. Accumulates multiple jobs into one open round so a driver is paid
 * once. Must run in the same tx as the delivery confirmation.
 */
export async function attachToDriverPayout(
  tx: Prisma.TransactionClient,
  txn: Transaction,
  actorId: string | null,
): Promise<void> {
  if (txn.payoutId) return; // already bundled

  const open = await tx.payout.findFirst({
    where: { driverId: txn.driverId, status: 'PENDING' },
  });
  if (open) {
    await tx.payout.update({
      where: { id: open.id },
      data: { amount: { increment: txn.netToDriver } },
    });
    await tx.transaction.update({ where: { id: txn.id }, data: { payoutId: open.id } });
  } else {
    const payout = await tx.payout.create({
      data: { driverId: txn.driverId, amount: txn.netToDriver, createdById: actorId },
    });
    await tx.transaction.update({ where: { id: txn.id }, data: { payoutId: payout.id } });
  }
}

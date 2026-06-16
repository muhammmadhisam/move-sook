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
      paymentMethod: job.paymentMethod,
      // For COD the commission was already collected from the driver up-front (and the
      // driver kept the gross in cash) — there is nothing to pay out, so it lands PAID.
      // Normally a COD job already has its row from createCodCommissionTransaction(); this
      // is the defensive fallback if delivery is confirmed without that step.
      status: job.paymentMethod === 'COD' ? 'PAID' : 'PENDING',
    },
  });
}

/**
 * Create the commission ledger entry for a COD job at the moment an admin approves
 * the driver's commission-fee slip — i.e. BEFORE delivery. Unlike the prepaid flow,
 * the driver collects the gross in cash and has already transferred commissionAmount
 * to the platform, so the row is recorded as `PAID` with NO payout to the driver
 * (it is excluded from payout bundling). Idempotent via the jobId unique: a later
 * `createDeliveryTransaction()` for the same job is a no-op. Must run inside the same
 * prisma transaction that stamps `codCommissionApprovedAt`.
 */
export async function createCodCommissionTransaction(
  tx: Prisma.TransactionClient,
  job: Job,
  slipUrl: string | null,
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
      paymentMethod: 'COD',
      status: 'PAID', // commission already collected from the driver; nothing left to pay out
      slipUrl,
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

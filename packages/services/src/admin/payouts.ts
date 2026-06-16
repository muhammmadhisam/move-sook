import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  pageArgs,
  orderByOf,
  writeAudit,
  notify,
} from '@movesook/services/support';
import type {
  AdminListPayoutsQuery,
  AdminCreatePayoutInput,
  AdminMarkPayoutPaidInput,
  PayoutDto,
} from '@movesook/shared';

export type PayoutListResponse = {
  items: PayoutDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Payout runs (list). */
export async function listPayouts(q: AdminListPayoutsQuery): Promise<PayoutListResponse> {
  const where = {
    ...(q.driverId ? { driverId: q.driverId } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.payout.findMany({
      where,
      orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'amount', 'status'], 'createdAt'),
      ...pageArgs(q),
      include: {
        driver: { include: { user: { select: { displayName: true } } } },
        transactions: { select: { jobId: true, commissionAmount: true } },
      },
    }),
    prisma.payout.count({ where }),
  ]);
  const items: PayoutDto[] = rows.map((p) => ({
    id: p.id,
    driverId: p.driverId,
    driverName: p.driver.user?.displayName ?? p.driver.name,
    driverCompletedCount: p.driver.completedCount,
    amount: p.amount,
    commissionTotal: p.transactions.reduce((n, t) => n + t.commissionAmount, 0),
    status: p.status,
    reference: p.reference,
    slipUrl: p.slipUrl,
    transactionCount: p.transactions.length,
    jobIds: p.transactions.map((t) => t.jobId),
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Bundle a driver's unpaid commission entries into a payout run. */
export async function createPayout(
  sub: string,
  input: AdminCreatePayoutInput,
): Promise<{ id: string; amount: number }> {
  const { driverId } = input;
  const actorId = sub;
  const pending = await prisma.transaction.findMany({
    // COD rows are PAID on collection (driver kept the cash) so they never appear
    // here, but pin paymentMethod=PREPAID too as an explicit guard.
    where: { driverId, status: 'PENDING', payoutId: null, paymentMethod: 'PREPAID' },
  });
  if (pending.length === 0) {
    throw new HTTPException(422, { message: 'No pending commission to pay out' });
  }
  const amount = pending.reduce((n, t) => n + t.netToDriver, 0);
  const payout = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.create({ data: { driverId, amount, createdById: actorId } });
    await tx.transaction.updateMany({
      where: { id: { in: pending.map((t) => t.id) } },
      data: { payoutId: p.id },
    });
    return p;
  });
  await writeAudit({
    actorId,
    action: 'payout.create',
    targetType: 'driver',
    targetId: driverId,
    metadata: { payoutId: payout.id, amount, count: pending.length },
  });
  return { id: payout.id, amount: payout.amount };
}

/** Mark a payout run as paid (flips its bundled transactions to PAID). */
export async function markPayoutPaid(
  sub: string,
  id: string,
  input: AdminMarkPayoutPaidInput,
): Promise<{ id: string; status: 'PAID' }> {
  const { reference, slipUrl } = input;
  const actorId = sub;
  const payout = await prisma.payout.findUnique({
    where: { id },
    include: { driver: { select: { userId: true } } },
  });
  if (!payout) throw new HTTPException(404, { message: 'Payout not found' });
  if (payout.status === 'PAID') throw new HTTPException(422, { message: 'Already paid' });
  await prisma.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        reference: reference ?? null,
        slipUrl: slipUrl ?? null,
      },
    });
    await tx.transaction.updateMany({ where: { payoutId: id }, data: { status: 'PAID' } });
  });
  await writeAudit({
    actorId,
    action: 'payout.paid',
    targetType: 'driver',
    targetId: payout.driverId,
    metadata: { payoutId: id, reference: reference ?? null, slipUrl: slipUrl ?? null },
  });
  if (payout.driver.userId) {
    await notify({
      userId: payout.driver.userId,
      type: 'GENERIC',
      title: 'โอนค่างานแล้ว',
      body: `โอนค่างานจำนวน ${payout.amount.toLocaleString()} บาท เรียบร้อยแล้ว`,
    });
  }
  return { id, status: 'PAID' as const };
}

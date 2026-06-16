import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  pageArgs,
  orderByOf,
  writeAudit,
  notify,
} from '@movesook/services/support';
import type {
  AdminListTransactionsQuery,
  AdminUpdateTransactionInput,
  TransactionDto,
  TransactionStatus,
} from '@movesook/shared';

export type TransactionListResponse = {
  items: TransactionDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Commission ledger (transactions). */
export async function listTransactions(
  q: AdminListTransactionsQuery,
): Promise<TransactionListResponse> {
  const where = q.status ? { status: q.status } : {};
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        job: { select: { paymentApprovedAt: true, paymentSlipUrl: true } },
        driver: { select: { name: true, completedCount: true, user: { select: { displayName: true } } } },
      },
      orderBy: orderByOf(
        q.sortBy,
        q.sortDir,
        ['createdAt', 'grossAmount', 'netToDriver', 'status'],
        'createdAt',
      ),
      ...pageArgs(q),
    }),
    prisma.transaction.count({ where }),
  ]);
  const items: TransactionDto[] = rows.map((t) => ({
    id: t.id,
    jobId: t.jobId,
    driverId: t.driverId,
    driverName: t.driver?.user?.displayName ?? t.driver?.name ?? null,
    driverCompletedCount: t.driver?.completedCount ?? 0,
    grossAmount: t.grossAmount,
    commissionPct: t.commissionPct,
    commissionAmount: t.commissionAmount,
    netToDriver: t.netToDriver,
    paymentMethod: t.paymentMethod,
    status: t.status,
    slipUrl: t.slipUrl,
    customerPaidAt: t.job.paymentApprovedAt ? t.job.paymentApprovedAt.toISOString() : null,
    customerSlipUrl: t.job.paymentSlipUrl,
    createdAt: t.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Mark a transaction paid / refunded (optionally attach a payment slip). */
export async function updateTransaction(
  sub: string,
  id: string,
  input: AdminUpdateTransactionInput,
): Promise<{ id: string; status: TransactionStatus; slipUrl: string | null }> {
  const { status, slipUrl } = input;
  const actorId = sub;
  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { driver: { select: { userId: true } } },
  });
  if (!txn) throw new HTTPException(404, { message: 'Transaction not found' });
  const updated = await prisma.transaction.update({
    where: { id },
    data: { status, ...(slipUrl !== undefined ? { slipUrl } : {}) },
  });
  await writeAudit({
    actorId,
    action: 'transaction.update',
    targetType: 'transaction',
    targetId: id,
    metadata: { from: txn.status, to: status },
  });
  // Tell the driver when their job payment is marked paid.
  if (status === 'PAID' && txn.status !== 'PAID' && txn.driver?.userId) {
    await notify({
      userId: txn.driver.userId,
      type: 'GENERIC',
      title: 'โอนค่างานแล้ว',
      body: `โอนค่างานจำนวน ${updated.netToDriver.toLocaleString()} บาท เรียบร้อยแล้ว`,
      jobId: updated.jobId,
    });
  }
  return { id: updated.id, status: updated.status, slipUrl: updated.slipUrl };
}

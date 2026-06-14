import { prisma } from '@movesook/db';
import { notify } from './notify';
import { getSystemSettings } from './settings';

// Scheduled maintenance tasks. These are the source of truth: both the
// in-process scheduler (src/lib/scheduler.ts, runs on a cron schedule) and the
// SYSTEM-only webhook endpoints (routes/webhooks.ts, for manual / external
// trigger) call these — keep all task logic here, not in the route handlers.

// Re-engage approved drivers who have gone idle (offline and inactive beyond the
// idle window) with a best-effort come-back-online nudge.
export async function nudgeIdleDrivers(): Promise<{ nudged: number }> {
  const idleDays = (await getSystemSettings()).idleNudgeDays;
  const cutoff = new Date(Date.now() - idleDays * 24 * 60 * 60 * 1000);
  const idle = await prisma.driver.findMany({
    where: {
      verifyStatus: 'APPROVED',
      isAvailable: false, // currently offline
      userId: { not: null }, // can only notify a linked app account
      OR: [{ lastActiveAt: { lt: cutoff } }, { lastActiveAt: null, createdAt: { lt: cutoff } }],
    },
    select: { userId: true },
    take: 500, // safety cap per run
  });

  let nudged = 0;
  for (const d of idle) {
    if (!d.userId) continue;
    await notify({
      userId: d.userId,
      type: 'GENERIC',
      title: 'มีงานขนย้ายรอคุณอยู่',
      body: 'เปิดสถานะออนไลน์เพื่อรับงานในพื้นที่ของคุณวันนี้',
    });
    nudged += 1;
  }
  return { nudged };
}

// Auto-cancel PENDING_PAYMENT jobs the customer abandoned: older than the expiry
// window AND with no slip awaiting review (a slip that an admin hasn't acted on
// must never be auto-cancelled under the customer).
export async function expirePendingPayment(): Promise<{ expired: number; disabled?: boolean }> {
  const days = (await getSystemSettings()).pendingPaymentExpireDays;
  if (days <= 0) return { expired: 0, disabled: true };
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const stale = await prisma.job.findMany({
    where: { status: 'PENDING_PAYMENT', paymentSlipUrl: null, createdAt: { lt: cutoff } },
    include: { customer: { select: { userId: true } } },
    take: 500, // safety cap per run
  });

  let expired = 0;
  for (const job of stale) {
    const res = await prisma.job.updateMany({
      // Re-check status so a slip uploaded mid-run can't be cancelled.
      where: { id: job.id, status: 'PENDING_PAYMENT', paymentSlipUrl: null },
      data: { status: 'CANCELLED' },
    });
    if (res.count === 0) continue;
    expired += 1;
    if (job.customer.userId) {
      await notify({
        userId: job.customer.userId,
        type: 'JOB_STATUS',
        title: 'งานถูกยกเลิกอัตโนมัติ',
        body: `ไม่พบการชำระเงินภายใน ${days} วัน — โพสต์งานใหม่ได้ทุกเมื่อ`,
        jobId: job.id,
      });
    }
  }
  return { expired };
}

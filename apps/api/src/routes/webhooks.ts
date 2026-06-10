import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@movesook/db';
import { env } from '../config';
import type { AppEnv } from '../lib/context';
import { requireSystem } from '../middleware/auth';
import { notify } from '../lib/notify';
import { getSystemSettings } from '../lib/settings';

// LINE webhook auth: when LINE_CHANNEL_SECRET is set, require a valid
// x-line-signature (base64 HMAC-SHA256 of the raw body) — this is what the
// LINE platform sends. Without the secret (dev / channel not wired yet) we
// fall back to the static x-system-key gate.
const verifyLineSignature = createMiddleware<AppEnv>(async (c, next) => {
  const secret = env.LINE_CHANNEL_SECRET;
  if (!secret) return requireSystem(c, next);
  const signature = c.req.header('x-line-signature');
  if (!signature) throw new HTTPException(401, { message: 'Missing LINE signature' });
  const raw = await c.req.arrayBuffer();
  const expected = createHmac('sha256', secret).update(Buffer.from(raw)).digest();
  const provided = Buffer.from(signature, 'base64');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new HTTPException(401, { message: 'Invalid LINE signature' });
  }
  await next();
});

export const webhookRoutes = new Hono<AppEnv>()
  .post('/line', verifyLineSignature, async (c) => {
    const payload = await c.req.json().catch(() => ({}));
    // TODO(phase-later): dispatch LINE events (follow/message) to handlers.
    console.info('[webhook] line event', JSON.stringify(payload).slice(0, 500));
    return c.json({ ok: true });
  })

  // SYSTEM-only (cron). Re-engage approved drivers who have gone idle (offline and
  // inactive beyond the idle window) with a best-effort come-back-online nudge.
  // Frequency is controlled by the caller's cron schedule.
  .post('/nudge-idle-drivers', requireSystem, async (c) => {
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
    return c.json({ nudged });
  })

  // SYSTEM-only (cron). Auto-cancel PENDING_PAYMENT jobs the customer abandoned:
  // older than the expiry window AND with no slip awaiting review (a slip that
  // an admin hasn't acted on must never be auto-cancelled under the customer).
  .post('/expire-pending-payment', requireSystem, async (c) => {
    const days = (await getSystemSettings()).pendingPaymentExpireDays;
    if (days <= 0) return c.json({ expired: 0, disabled: true });
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
    return c.json({ expired });
  });

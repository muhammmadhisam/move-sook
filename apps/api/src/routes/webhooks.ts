import { Hono } from 'hono';
import { prisma } from '@movesook/db';
import type { AppEnv } from '../lib/context';
import { requireSystem } from '../middleware/auth';
import { notify } from '../lib/notify';
import { getSystemSettings } from '../lib/settings';

// SYSTEM-only. LINE webhook signature is validated via the static x-system-key
// gateway header here; full LINE channel-secret HMAC validation is a follow-up.
export const webhookRoutes = new Hono<AppEnv>()
  .post('/line', requireSystem, async (c) => {
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
  });

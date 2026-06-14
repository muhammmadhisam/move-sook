import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config';
import type { AppEnv } from '../lib/context';
import { requireSystem } from '../middleware/auth';
import { nudgeIdleDrivers, expirePendingPayment } from '../lib/cron-tasks';

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
    // Surface each event's source IDs so an admin can copy the group/room ID to
    // paste into Settings → admin_line_group_id (the OA must be in that group).
    const events: Array<{ type?: string; source?: Record<string, unknown> }> = Array.isArray(
      (payload as { events?: unknown }).events,
    )
      ? (payload as { events: Array<{ type?: string; source?: Record<string, unknown> }> }).events
      : [];
    for (const ev of events) {
      console.info('[webhook] line event', ev.type, 'source=', JSON.stringify(ev.source ?? {}));
    }
    if (events.length === 0) console.info('[webhook] line event', JSON.stringify(payload).slice(0, 500));
    return c.json({ ok: true });
  })

  // SYSTEM-only manual / external trigger for the idle-driver nudge. The task
  // also runs in-process on a cron schedule (src/lib/scheduler.ts); this
  // endpoint stays for ad-hoc runs and external schedulers. Logic lives in
  // src/lib/cron-tasks.ts so both paths share one implementation.
  .post('/nudge-idle-drivers', requireSystem, async (c) => {
    return c.json(await nudgeIdleDrivers());
  })

  // SYSTEM-only manual / external trigger for expiring abandoned unpaid jobs.
  // Mirrors the in-process scheduler; see src/lib/cron-tasks.ts.
  .post('/expire-pending-payment', requireSystem, async (c) => {
    return c.json(await expirePendingPayment());
  });

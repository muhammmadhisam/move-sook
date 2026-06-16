import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../lib/context';
import { requireSystem } from '../middleware/auth';
import {
  handleLineWebhook,
  isLineSignatureRequired,
  runExpirePendingPayment,
  runNudgeIdleDrivers,
  verifyLineSignature,
} from '@movesook/services/webhooks';

// LINE webhook auth: when LINE_CHANNEL_SECRET is set, require a valid
// x-line-signature (base64 HMAC-SHA256 of the raw body) — this is what the
// LINE platform sends. Without the secret (dev / channel not wired yet) we
// fall back to the static x-system-key gate.
//
// Reading the header + raw body are HTTP concerns and stay here; the pure
// HMAC compare lives in @movesook/services/webhooks.
const verifyLineSignatureMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (!isLineSignatureRequired()) return requireSystem(c, next);
  const signature = c.req.header('x-line-signature');
  if (!signature) throw new HTTPException(401, { message: 'Missing LINE signature' });
  const raw = await c.req.arrayBuffer();
  if (!verifyLineSignature(raw, signature)) {
    throw new HTTPException(401, { message: 'Invalid LINE signature' });
  }
  await next();
});

export const webhookRoutes = new Hono<AppEnv>()
  .post('/line', verifyLineSignatureMiddleware, async (c) => {
    const payload = await c.req.json().catch(() => ({}));
    return c.json(await handleLineWebhook(payload));
  })

  // SYSTEM-only manual / external trigger for the idle-driver nudge. The task
  // also runs in-process on a cron schedule; this endpoint stays for ad-hoc runs
  // and external schedulers. Logic lives in support/cron-tasks.ts so both paths
  // share one implementation.
  .post('/nudge-idle-drivers', requireSystem, async (c) => {
    return c.json(await runNudgeIdleDrivers());
  })

  // SYSTEM-only manual / external trigger for expiring abandoned unpaid jobs.
  // Mirrors the in-process scheduler; see support/cron-tasks.ts.
  .post('/expire-pending-payment', requireSystem, async (c) => {
    return c.json(await runExpirePendingPayment());
  });

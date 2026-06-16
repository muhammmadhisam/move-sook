import { createHmac, timingSafeEqual } from 'node:crypto';
import { nudgeIdleDrivers, expirePendingPayment } from '../support';
import { getEnv } from '../runtime/env';

// Webhook domain logic. HTTP concerns (reading the raw body, x-line-signature
// header, and the requireSystem middleware) stay in apps/api/src/routes/webhooks.ts;
// these functions receive already-extracted plain values and do the dispatch.

/** Whether LINE signature verification is active (channel secret configured). */
export function isLineSignatureRequired(): boolean {
  return Boolean(getEnv().LINE_CHANNEL_SECRET);
}

/**
 * Verify a LINE x-line-signature against the raw request body.
 * Pure: takes the raw body bytes + the base64 signature header, reads the secret
 * lazily, and returns a boolean. The route reads the body/header from the Hono
 * context and decides the HTTP response.
 */
export function verifyLineSignature(rawBody: ArrayBuffer, signature: string): boolean {
  const secret = getEnv().LINE_CHANNEL_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(Buffer.from(rawBody)).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Dispatch a parsed LINE webhook payload. The route parses JSON off the request
 * and hands the plain object here. Event dispatch is still a logged stub.
 *
 * Surface each event's source IDs so an admin can copy the group/room ID to paste
 * into Settings → admin_line_group_id (the OA must be in that group).
 */
export async function handleLineWebhook(payload: unknown): Promise<{ ok: true }> {
  // TODO(phase-later): dispatch LINE events (follow/message) to handlers.
  const events: Array<{ type?: string; source?: Record<string, unknown> }> = Array.isArray(
    (payload as { events?: unknown }).events,
  )
    ? (payload as { events: Array<{ type?: string; source?: Record<string, unknown> }> }).events
    : [];
  for (const ev of events) {
    console.info('[webhook] line event', ev.type, 'source=', JSON.stringify(ev.source ?? {}));
  }
  if (events.length === 0)
    console.info('[webhook] line event', JSON.stringify(payload).slice(0, 500));
  return { ok: true };
}

/**
 * SYSTEM-only idle-driver nudge. Mirrors the in-process cron schedule; logic lives
 * once in support/cron-tasks.ts so both paths share one implementation.
 */
export async function runNudgeIdleDrivers() {
  return nudgeIdleDrivers();
}

/** SYSTEM-only expiry of abandoned unpaid jobs. Mirrors the in-process scheduler. */
export async function runExpirePendingPayment() {
  return expirePendingPayment();
}

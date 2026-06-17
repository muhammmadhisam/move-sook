import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@movesook/db';
import { nudgeIdleDrivers, expirePendingPayment } from '../support';
import { getEnv, getLogger } from '../runtime/env';

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

type LineEventSource = { type?: string; userId?: string; groupId?: string; roomId?: string };
type LineEvent = { type?: string; source?: LineEventSource };

/**
 * Dispatch a parsed LINE webhook payload. The route parses JSON off the request
 * and hands the plain object here.
 *
 * Currently handled:
 *  - follow   → user added the OA: flag lineFollowing=true (now reachable by push)
 *  - unfollow → user blocked/removed the OA: flag lineFollowing=false
 * Other event types (message/postback/group) are logged for now — their source
 * IDs are still surfaced so an admin can copy a group/room ID into Settings.
 */
export async function handleLineWebhook(payload: unknown): Promise<{ ok: true }> {
  const events: LineEvent[] = Array.isArray((payload as { events?: unknown }).events)
    ? (payload as { events: LineEvent[] }).events
    : [];
  for (const ev of events) {
    await dispatchLineEvent(ev);
  }
  if (events.length === 0)
    getLogger().info(
      { payload: JSON.stringify(payload).slice(0, 500) },
      '[webhook] line event (no events)',
    );
  return { ok: true };
}

async function dispatchLineEvent(ev: LineEvent): Promise<void> {
  switch (ev.type) {
    case 'follow':
      await setFollowState(ev.source?.userId, true);
      break;
    case 'unfollow':
      await setFollowState(ev.source?.userId, false);
      break;
    default:
      getLogger().info(
        { eventType: ev.type, source: ev.source ?? {} },
        '[webhook] line event (unhandled)',
      );
  }
}

/**
 * Persist the OA follow state onto the matching User. updateMany (not update) so a
 * follow/unfollow from a LINE account that never logged in is a no-op (count 0)
 * rather than throwing — we only track accounts we already know.
 */
async function setFollowState(lineUserId: string | undefined, following: boolean): Promise<void> {
  if (!lineUserId) return;
  const now = new Date();
  const res = await prisma.user.updateMany({
    where: { lineUserId },
    data: following
      ? { lineFollowing: true, lineFollowedAt: now }
      : { lineFollowing: false, lineUnfollowedAt: now },
  });
  getLogger().info({ following, matched: res.count }, '[webhook] line follow state updated');
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

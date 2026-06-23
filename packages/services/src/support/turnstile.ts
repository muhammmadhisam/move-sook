import { getEnv, getLogger } from '../runtime/env';

// Cloudflare Turnstile server-side verification for the public fare calculator.
// The browser solves the challenge and sends the token; we confirm it with
// Cloudflare's siteverify before honouring the (rate-limited) guest estimate.
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Turnstile token. Returns true when the challenge passed.
 *
 * - Secret unset → returns true (feature disabled in dev / not configured).
 * - Missing/blank token (with a secret set) → false (the client must solve it).
 * - Cloudflare says success:false → false (failed/forged/expired token).
 * - Network/parse error reaching Cloudflare → true (fail OPEN): a Cloudflare
 *   outage must not block every visitor from getting a quote — the per-IP rate
 *   limit ([[checkEstimateQuota]]) still bounds abuse in that window.
 */
export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = getEnv().TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    getLogger().error({ err }, '[turnstile] siteverify unreachable — allowing');
    return true;
  }
}

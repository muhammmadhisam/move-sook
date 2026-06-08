import { ADMIN_LOGIN_LOCKOUT_MS, ADMIN_LOGIN_MAX_ATTEMPTS } from '@movesook/shared';

// Minimal in-memory fixed-window limiter for admin login brute-force defence.
// Adequate for a single API instance; swap for Redis when horizontally scaled.
type Bucket = { count: number; firstAt: number; lockedUntil: number };
const buckets = new Map<string, Bucket>();

export interface RateResult {
  allowed: boolean;
  retryAfterSec: number;
}

export function checkAdminLogin(key: string): RateResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (b && b.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  if (!b || now - b.firstAt > ADMIN_LOGIN_LOCKOUT_MS) {
    buckets.set(key, { count: 0, firstAt: now, lockedUntil: 0 });
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Record a failed attempt; locks the key once the threshold is exceeded. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const b = buckets.get(key) ?? { count: 0, firstAt: now, lockedUntil: 0 };
  b.count += 1;
  if (b.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
    b.lockedUntil = now + ADMIN_LOGIN_LOCKOUT_MS;
  }
  buckets.set(key, b);
}

/** Clear the bucket on successful login. */
export function recordSuccess(key: string): void {
  buckets.delete(key);
}

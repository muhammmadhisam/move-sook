import {
  ADMIN_LOGIN_LOCKOUT_MS,
  ADMIN_LOGIN_MAX_ATTEMPTS,
  ESTIMATE_GUEST_MAX,
  ESTIMATE_GUEST_WINDOW_MS,
} from '@movesook/shared';
import { redis } from './redis';
import { getLogger } from '../runtime/env';

// Redis-backed fixed-window limiter for admin login brute-force defence. Shared
// across instances (unlike the old in-memory Map). Two keys per principal:
//   cnt:<key>  — failed-attempt counter, expires after the window
//   lock:<key> — present (with TTL) once the threshold is tripped
//
// Fails OPEN on a Redis error: a Redis blip must not lock every admin out. The
// bcrypt compare still gates each attempt, so the brute-force window is bounded.

const cntKey = (key: string) => `rl:adminlogin:cnt:${key}`;
const lockKey = (key: string) => `rl:adminlogin:lock:${key}`;

export interface RateResult {
  allowed: boolean;
  retryAfterSec: number;
}

export async function checkAdminLogin(key: string): Promise<RateResult> {
  try {
    const pttl = await redis().pttl(lockKey(key));
    if (pttl > 0) return { allowed: false, retryAfterSec: Math.ceil(pttl / 1000) };
    return { allowed: true, retryAfterSec: 0 };
  } catch (err) {
    getLogger().error({ err }, '[rate-limit] checkAdminLogin failed (allowing)');
    return { allowed: true, retryAfterSec: 0 };
  }
}

/** Record a failed attempt; locks the key once the threshold is exceeded. */
export async function recordFailure(key: string): Promise<void> {
  try {
    const count = await redis().incr(cntKey(key));
    if (count === 1) await redis().pexpire(cntKey(key), ADMIN_LOGIN_LOCKOUT_MS);
    if (count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
      await redis().set(lockKey(key), '1', 'PX', ADMIN_LOGIN_LOCKOUT_MS);
    }
  } catch (err) {
    getLogger().error({ err }, '[rate-limit] recordFailure failed');
  }
}

/** Clear the counter + lock on successful login. */
export async function recordSuccess(key: string): Promise<void> {
  try {
    await redis().del(cntKey(key), lockKey(key));
  } catch (err) {
    getLogger().error({ err }, '[rate-limit] recordSuccess failed');
  }
}

// ── Public fare-calculator quota (anonymous callers only) ───────────────────
// Fixed-window per-IP counter for POST /jobs/estimate by guests, so the free
// pricing-page calculator can't be hammered (each quote costs a Google Directions
// call). One INCR per attempt; the window TTL is set on the first hit so it rolls
// from the first quote. Fails OPEN on a Redis error — a Redis blip must never
// block legitimate browsing.

const estimateKey = (ip: string) => `rl:estimate:${ip}`;

export interface EstimateQuota {
  allowed: boolean;
  /** Quotes still available in the current window (never negative). */
  remaining: number;
  /** Seconds until the window resets (for a Retry-After header). */
  retryAfterSec: number;
}

/** Count one guest estimate attempt and report whether it's within the cap. */
export async function checkEstimateQuota(ip: string): Promise<EstimateQuota> {
  try {
    const key = estimateKey(ip);
    const count = await redis().incr(key);
    if (count === 1) await redis().pexpire(key, ESTIMATE_GUEST_WINDOW_MS);
    const ttl = await redis().pttl(key);
    return {
      allowed: count <= ESTIMATE_GUEST_MAX,
      remaining: Math.max(0, ESTIMATE_GUEST_MAX - count),
      retryAfterSec: ttl > 0 ? Math.ceil(ttl / 1000) : Math.ceil(ESTIMATE_GUEST_WINDOW_MS / 1000),
    };
  } catch (err) {
    getLogger().error({ err }, '[rate-limit] checkEstimateQuota failed (allowing)');
    return { allowed: true, remaining: ESTIMATE_GUEST_MAX, retryAfterSec: 0 };
  }
}

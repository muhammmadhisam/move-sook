import { ADMIN_LOGIN_LOCKOUT_MS, ADMIN_LOGIN_MAX_ATTEMPTS } from '@movesook/shared';
import { redis } from './redis';

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
    const pttl = await redis.pttl(lockKey(key));
    if (pttl > 0) return { allowed: false, retryAfterSec: Math.ceil(pttl / 1000) };
    return { allowed: true, retryAfterSec: 0 };
  } catch (err) {
    console.error('[rate-limit] checkAdminLogin failed (allowing)', err);
    return { allowed: true, retryAfterSec: 0 };
  }
}

/** Record a failed attempt; locks the key once the threshold is exceeded. */
export async function recordFailure(key: string): Promise<void> {
  try {
    const count = await redis.incr(cntKey(key));
    if (count === 1) await redis.pexpire(cntKey(key), ADMIN_LOGIN_LOCKOUT_MS);
    if (count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
      await redis.set(lockKey(key), '1', 'PX', ADMIN_LOGIN_LOCKOUT_MS);
    }
  } catch (err) {
    console.error('[rate-limit] recordFailure failed', err);
  }
}

/** Clear the counter + lock on successful login. */
export async function recordSuccess(key: string): Promise<void> {
  try {
    await redis.del(cntKey(key), lockKey(key));
  } catch (err) {
    console.error('[rate-limit] recordSuccess failed', err);
  }
}

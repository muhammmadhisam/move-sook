import { redis } from './redis';
import { getLogger } from '../runtime/env';

// Read-through cache for expensive, read-only computations — the admin
// analytics/reports surface runs multi-table aggregations on every dashboard load.
// Results are JSON-serialised into Redis with a short TTL; staleness up to the TTL
// is the accepted trade for not re-querying on every view, and these read paths
// have no write to invalidate against (they just age out).
//
// Fully best-effort: any Redis error (miss, parse failure, connection blip) falls
// through to the producer, so the cache can never break or stall an endpoint.
// Cached values MUST be plain JSON — the admin DTOs are (numbers/strings/arrays,
// no Date/Map/Buffer); a value that isn't will round-trip lossily.

const PREFIX = 'cache:';

/** TTLs (seconds) per cached dataset — tuned to how fast each one meaningfully moves. */
export const CACHE_TTL = {
  stats: 60, // dashboard cards + actionable queue counts: near-fresh
  analytics: 300, // time-series/funnel/leaderboard: 5 min is plenty
  supplyDemand: 60, // marketplace liquidity drives ops nudges: keep tight
  retention: 900, // monthly cohorts move slowly: 15 min
  reports: 300, // period financials: 5 min
} as const;

/**
 * Return the cached value for `key`, or compute it via `producer`, store it under
 * `key` with a `ttlSec` expiry, and return it. Never throws on cache faults.
 */
export async function cached<T>(
  key: string,
  ttlSec: number,
  producer: () => Promise<T>,
): Promise<T> {
  const fullKey = PREFIX + key;
  try {
    const hit = await redis().get(fullKey);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    getLogger().error({ err, key }, '[cache] read failed — computing fresh');
  }
  const value = await producer();
  try {
    await redis().set(fullKey, JSON.stringify(value), 'EX', ttlSec);
  } catch (err) {
    getLogger().error({ err, key }, '[cache] write failed');
  }
  return value;
}

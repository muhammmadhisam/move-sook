import { Redis } from 'ioredis';
import { getEnv } from '../runtime/env';

// Two connections with different failure semantics:
//
// - `bullConnection` — for BullMQ (Queue + Worker). BullMQ requires
//   `maxRetriesPerRequest: null` so its blocking commands (BRPOPLPUSH etc.)
//   wait through reconnects instead of erroring.
// - `redis` — general commands (rate limiter). Keeps the default retry budget so
//   a Redis blip fails fast rather than hanging a request thread.
//
// Both are lazy (connect on first command) so importing this module never blocks
// boot, and share the single REDIS_URL. They are also constructed lazily (on first
// access) so that reading REDIS_URL happens after the app has called
// configureServices() — never at module-import time.

let _bull: Redis | null = null;
let _redis: Redis | null = null;

function attachErrorLogger(name: string, conn: Redis): Redis {
  conn.on('error', (err) => console.error(`[redis:${name}] connection error`, err.message));
  return conn;
}

/** Shared BullMQ connection (maxRetriesPerRequest: null). */
export function bullConnection(): Redis {
  if (!_bull) {
    _bull = attachErrorLogger(
      'bull',
      new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true }),
    );
  }
  return _bull;
}

/** Shared general-purpose connection (rate limiter etc.). */
export function redis(): Redis {
  if (!_redis) {
    _redis = attachErrorLogger('redis', new Redis(getEnv().REDIS_URL, { lazyConnect: true }));
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled(
    [_bull, _redis].filter((c): c is Redis => c !== null).map((c) => c.quit()),
  );
}

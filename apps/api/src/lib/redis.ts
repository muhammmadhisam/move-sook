import { Redis } from 'ioredis';
import { env } from '../config';

// Two connections with different failure semantics:
//
// - `bullConnection` — for BullMQ (Queue + Worker). BullMQ requires
//   `maxRetriesPerRequest: null` so its blocking commands (BRPOPLPUSH etc.)
//   wait through reconnects instead of erroring.
// - `redis` — general commands (rate limiter). Keeps the default retry budget so
//   a Redis blip fails fast rather than hanging a request thread.
//
// Both are lazy (connect on first command) so importing this module never blocks
// boot, and share the single REDIS_URL.

export const bullConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
});

for (const [name, conn] of [
  ['bull', bullConnection],
  ['redis', redis],
] as const) {
  conn.on('error', (err) => console.error(`[redis:${name}] connection error`, err.message));
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([bullConnection.quit(), redis.quit()]);
}

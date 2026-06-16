// Runtime config seam for @movesook/services.
//
// The package owns domain + infrastructure logic (queues, redis, push, doc links)
// that needs a handful of environment values, but it must NOT own env *validation*
// — that fail-fast lives in the app entrypoint (`apps/api/src/config.ts`). The app
// validates env once at boot and hands the result to `configureServices()`; package
// modules then read it lazily through `getEnv()` (always inside functions, never at
// import time, so call order is irrelevant).

/** The subset of the API env the services package depends on. The app's full env
 *  object is a structural superset and is assignable to this. */
export interface ServiceEnv {
  PORT: number;
  JWT_SECRET: string;
  PUBLIC_API_URL?: string;
  WEB_ORIGIN: string;
  ADMIN_ORIGIN: string;
  LINE_CHANNEL_ID: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;
  SYSTEM_API_KEY: string;
  REDIS_URL: string;
  WORKERS_ENABLED: boolean;
  CRON_NUDGE_SCHEDULE: string;
  CRON_EXPIRE_SCHEDULE: string;
}

let _env: ServiceEnv | null = null;

/** Called once by the app at boot, after env has been validated. */
export function configureServices(env: ServiceEnv): void {
  _env = env;
}

/** Read the configured env. Throws if the app forgot to call configureServices(). */
export function getEnv(): ServiceEnv {
  if (!_env) {
    throw new Error(
      '@movesook/services: env not configured — call configureServices(env) at app boot before using services.',
    );
  }
  return _env;
}

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
  /** Public base URL of the R2 bucket (when uploads are served direct from R2). */
  R2_PUBLIC_URL?: string;
  /** Server-side Google Maps key for the cached Directions/Geocoding proxy. */
  GOOGLE_MAPS_SERVER_KEY?: string;
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

// ── Observability seam ──────────────────────────────────────────────────────
// Same pattern as env: the package must NOT depend on the app's pino/Sentry, so
// the app injects a structured logger + an error reporter at boot via
// `configureObservability()`. Until then both default to console / no-op, so the
// package works standalone (tests, scripts) without wiring.

/** Minimal structured-logger shape — satisfied by pino's Logger and by console. */
export interface LogFn {
  (obj: Record<string, unknown>, msg?: string): void;
  (msg: string): void;
}
export interface ServiceLogger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

/** Report a fault to the app's error tracker (Sentry). No-op until configured. */
export type ErrorReporter = (err: unknown, context?: Record<string, unknown>) => void;

function makeConsoleFn(level: 'info' | 'warn' | 'error'): LogFn {
  return ((obj: Record<string, unknown> | string, msg?: string) => {
    if (typeof obj === 'string') console[level](obj);
    else console[level](msg ?? '', obj);
  }) as LogFn;
}

const consoleLogger: ServiceLogger = {
  info: makeConsoleFn('info'),
  warn: makeConsoleFn('warn'),
  error: makeConsoleFn('error'),
};

let _logger: ServiceLogger = consoleLogger;
let _reportError: ErrorReporter = () => {};

/** Called once by the app at boot to inject pino + Sentry into the package. */
export function configureObservability(o: {
  logger?: ServiceLogger;
  reportError?: ErrorReporter;
}): void {
  if (o.logger) _logger = o.logger;
  if (o.reportError) _reportError = o.reportError;
}

/** The injected structured logger (console until `configureObservability`). */
export function getLogger(): ServiceLogger {
  return _logger;
}

/** Report a fault to the app's error tracker. No-op until configured. */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  _reportError(err, context);
}

// ── Generated-document cache seam ─────────────────────────────────────────────
// PDF rendering (pdf.ts) is slow: it fetches remote images + runs pdfkit. To cache
// the rendered bytes we need blob storage, but the storage boundary (R2/disk)
// deliberately lives in the app (apps/api/src/routes/uploads.ts), and this package
// has neither the S3 client nor the R2 credentials. So the app injects a store
// here at boot, same pattern as env/observability. Until then it's null and
// rendering stays inline (no cache) — fine for tests/standalone.

/** Blob store for cached generated documents (content-addressed keys). */
export interface DocStore {
  /** Return the cached bytes for `key`, or null on a miss. */
  get(key: string): Promise<Buffer | null>;
  /** Persist `bytes` under `key`. */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
}

let _docStore: DocStore | null = null;

/** Called once by the app at boot to back the document cache with R2/disk. */
export function configureDocStore(store: DocStore): void {
  _docStore = store;
}

/** The injected document cache, or null when none is configured (caching off). */
export function getDocStore(): DocStore | null {
  return _docStore;
}

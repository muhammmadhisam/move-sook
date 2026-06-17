import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";
import { configureServices } from "@movesook/services/runtime";

// Load the repo-root .env (single source for all apps in dev).
loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv(); // also pick up a local apps/api/.env if present

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  // Pino log level. Lower = quieter; "debug"/"trace" for local digging.
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  // Sentry error tracking. Absent DSN = Sentry stays a no-op (dev default).
  SENTRY_DSN: z.string().url().optional(),
  // Performance-trace sampling (0 = errors only). Keep low in prod.
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // HS256 signs with the raw secret bytes; ≥32 chars keeps the key at/above the
  // 256-bit security level of the HMAC so it can't be the weak link.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  USER_COOKIE_NAME: z.string().default("ms_user_session"),
  ADMIN_COOKIE_NAME: z.string().default("ms_admin_session"),
  LINE_CHANNEL_ID: z.string().min(1, "LINE_CHANNEL_ID is required"),
  // Optional: LINE Messaging API channel access token for push notifications.
  // When absent, push is a graceful no-op and only in-app notifications fire.
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  // Optional: LINE Messaging API channel secret. When set, POST /webhooks/line
  // validates the x-line-signature HMAC; when absent it falls back to the
  // static x-system-key gate (dev / before the channel is wired).
  LINE_CHANNEL_SECRET: z.string().optional(),
  SYSTEM_API_KEY: z.string().min(8, "SYSTEM_API_KEY is required"),
  // Public base URL of THIS api (used to build absolute links the customer opens
  // from outside a session — e.g. the receipt button in a LINE Flex card). In
  // prod set it to the api's https origin; falls back to localhost:PORT in dev.
  PUBLIC_API_URL: z.string().url().optional(),
  WEB_ORIGIN: z.string().url().default("http://localhost:9000"),
  ADMIN_ORIGIN: z.string().url().default("http://localhost:9001"),
  COOKIE_DOMAIN: z.string().optional(),
  // Cloudflare R2 (S3-compatible) object storage for uploads. When all four
  // R2_* vars below are set, uploads go to R2; otherwise local ./uploads (dev).
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  // Optional public base URL (custom domain or r2.dev) — when set, upload URLs
  // point straight at R2 instead of being proxied through GET /uploads/*.
  R2_PUBLIC_URL: z.string().url().optional(),
  // Redis — backs BullMQ (LINE-push queue + repeatable maintenance jobs) and the
  // admin-login rate limiter. Required: the queue/worker layer and rate limiter
  // all depend on it.
  REDIS_URL: z.string().min(1, "REDIS_URL is required").default("redis://localhost:6379"),
  // Run BullMQ workers (push + maintenance) in this process. Keep on for the
  // all-in-one deploy; set false on web-only replicas when workers run as a
  // separate process. Repeatable-job scheduling is coordinated through Redis, so
  // running workers on several instances is safe (each job runs once).
  WORKERS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Cron patterns (5-field) for the repeatable maintenance jobs, server tz.
  CRON_NUDGE_SCHEDULE: z.string().default("0 10 * * *"), // 10:00 daily
  CRON_EXPIRE_SCHEDULE: z.string().default("*/30 * * * *"), // every 30 min
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message before the server boots.
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

// Hand the validated env to the services package (queues / redis / push / doc
// links read it lazily via getEnv()). Done once here, at the single boot-time
// entrypoint that owns env validation.
configureServices(env);

export const r2Enabled = Boolean(
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
);
if (isProd && !r2Enabled) {
  console.warn("⚠️ R2 is not configured — uploads will be stored on local disk.");
}
// Without the channel secret, POST /webhooks/line silently falls back to the
// static x-system-key gate instead of verifying LINE's HMAC signature. Fine in
// dev; in production it means anyone with the system key can forge LINE events.
if (isProd && !env.LINE_CHANNEL_SECRET) {
  console.warn(
    "⚠️ LINE_CHANNEL_SECRET is not set — /webhooks/line cannot verify the LINE signature and falls back to the static system key.",
  );
}

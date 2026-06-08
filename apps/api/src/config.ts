import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Load the repo-root .env (single source for all apps in dev).
loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv(); // also pick up a local apps/api/.env if present

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8778),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  USER_COOKIE_NAME: z.string().default("ms_user_session"),
  ADMIN_COOKIE_NAME: z.string().default("ms_admin_session"),
  LINE_CHANNEL_ID: z.string().min(1, "LINE_CHANNEL_ID is required"),
  // Optional: LINE Messaging API channel access token for push notifications.
  // When absent, push is a graceful no-op and only in-app notifications fire.
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  SYSTEM_API_KEY: z.string().min(8, "SYSTEM_API_KEY is required"),
  WEB_ORIGIN: z.string().url().default("http://localhost:9000"),
  ADMIN_ORIGIN: z.string().url().default("http://localhost:9001"),
  COOKIE_DOMAIN: z.string().optional(),
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

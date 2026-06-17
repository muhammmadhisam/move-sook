import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server (only the traced deps) for a slim Docker image.
  output: "standalone",
  // Trace from the monorepo root so pnpm workspace packages are bundled into standalone.
  outputFileTracingRoot: join(__dirname, "../../"),
  transpilePackages: [
    "@movesook/ui",
    "@movesook/shared",
    "@movesook/api",
    "@movesook/thailand-provinces",
  ],
};

// Inert at build time unless SENTRY_AUTH_TOKEN + org/project are set (source-map
// upload runs in CI — Phase 5). Runtime SDK is gated on NEXT_PUBLIC_SENTRY_DSN.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});

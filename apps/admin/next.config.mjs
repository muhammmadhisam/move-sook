import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Security response headers for the admin console. Stricter than the public web:
// no referrer leaks at all and all device APIs off — the back office needs none.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tree-shake icon/util barrels to per-icon imports — smaller client JS, lower TBT.
  experimental: { optimizePackageImports: ["lucide-react"] },
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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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

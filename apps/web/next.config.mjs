import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server (only the traced deps) for a slim Docker image.
  output: 'standalone',
  // Trace from the monorepo root so pnpm workspace packages are bundled into standalone.
  outputFileTracingRoot: join(__dirname, '../../'),
  transpilePackages: [
    '@movesook/ui',
    '@movesook/shared',
    '@movesook/api',
    '@movesook/thailand-provinces',
  ],
};

export default nextConfig;

// Security response headers applied to every route. HSTS forces HTTPS;
// frame-ancestors 'none' + X-Frame-Options DENY block clickjacking; nosniff
// stops MIME-sniffing; the referrer + permissions policies trim metadata leak
// and disable unused device APIs. geolocation=(self) is kept for driver live
// tracking; camera/microphone are off (uploads use the OS file picker, not
// getUserMedia, so the file-input camera capture still works).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tree-shake icon/util barrels to per-icon imports — smaller client JS, lower TBT.
  experimental: { optimizePackageImports: ['lucide-react'] },
  transpilePackages: [
    '@movesook/ui',
    '@movesook/shared',
    '@movesook/api',
    '@movesook/thailand-provinces',
  ],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

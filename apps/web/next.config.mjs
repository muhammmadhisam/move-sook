/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@movesook/ui',
    '@movesook/shared',
    '@movesook/api',
    '@movesook/thailand-provinces',
  ],
};

export default nextConfig;

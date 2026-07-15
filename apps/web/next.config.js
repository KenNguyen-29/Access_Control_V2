/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@acv2/shared'],
  experimental: {
    // Tree-shake large icon/util barrels so only used exports are bundled.
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;

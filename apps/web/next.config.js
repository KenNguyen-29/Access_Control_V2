/** @type {import('next').NextConfig} */
const enableHsts = process.env.ENABLE_HSTS === 'true';

const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@acv2/shared'],
  poweredByHeader: false,
  experimental: {
    // Tree-shake large icon/util barrels so only used exports are bundled.
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      {
        key: 'Content-Security-Policy-Report-Only',
        value:
          "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' http: https: ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
      },
    ];
    if (enableHsts) {
      security.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      });
    }
    return [
      {
        source: '/:path*',
        headers: security,
      },
    ];
  },
};

module.exports = nextConfig;

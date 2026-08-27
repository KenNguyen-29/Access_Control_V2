/** @type {import('next').NextConfig} */
const enableHsts = process.env.ENABLE_HSTS === 'true';
const apiProxyTarget = (process.env.API_PROXY_TARGET || 'http://127.0.0.1:8010').replace(/\/+$/, '');

const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@acv2/shared'],
  poweredByHeader: false,
  experimental: {
    // Tree-shake large icon/util barrels so only used exports are bundled.
    optimizePackageImports: ['lucide-react'],
  },
  async rewrites() {
    // Keep browser requests same-origin. The target is a service name/local
    // address, never a LAN IP, so the same build works on every network.
    return [
      { source: '/api/:path*', destination: `${apiProxyTarget}/api/:path*` },
      // Socket.IO's polling endpoint requires the trailing slash; Next's
      // normalized redirect otherwise turns it into the API's 404 route.
      { source: '/socket.io', destination: `${apiProxyTarget}/socket.io/` },
      { source: '/socket.io/:path*', destination: `${apiProxyTarget}/socket.io/:path*` },
    ];
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

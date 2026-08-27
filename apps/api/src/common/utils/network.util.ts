import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'os';
import type { ConfigService } from '@nestjs/config';

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const LINK_LOCAL_PREFIX = '169.254.';
const VIRTUAL_INTERFACE = /(virtual|vEthernet|docker|wsl|vmware|virtualbox|hyper-v|loopback|tunnel|teredo)/i;

export function isIpv4Address(value: string): boolean {
  return IPV4.test(value.trim());
}

/**
 * Return a usable fallback local IPv4 address without baking a site-specific
 * address into the application. Every adapter is considered; virtual/VPN
 * adapters remain eligible so a VPN-only deployment still has a fallback.
 */
export function detectPrimaryIpv4(): string | null {
  const candidates: Array<{ address: string; score: number; order: number }> = [];
  let order = 0;

  for (const [interfaceName, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      const family = entry.family === 'IPv4' || String(entry.family) === '4';
      const address = entry.address?.trim();
      if (!family || entry.internal || !address || !IPV4.test(address)) continue;

      const octets = address.split('.').map(Number);
      const first = octets[0];
      if (first === 127 || first >= 224 || address.startsWith(LINK_LOCAL_PREFIX)) continue;

      let score = VIRTUAL_INTERFACE.test(interfaceName) ? 20 : 0;
      const prefixLength = Number(entry.cidr?.split('/')[1]);
      // VPN/tunnel adapters commonly expose a /32 address and are not the
      // interface that local cameras can call back. Keep them as a fallback,
      // but prefer a normal LAN prefix when one is available.
      if (prefixLength === 32) score += 10;
      // Prefer RFC1918 addresses for local device callbacks over public or
      // link-local interfaces, while still allowing any routable IPv4.
      const isPrivate =
        first === 10 ||
        (first === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (first === 192 && octets[1] === 168);
      if (!isPrivate) score += 5;
      candidates.push({ address, score, order: order++ });
    }
  }

  candidates.sort((a, b) => a.score - b.score || a.order - b.order);
  return candidates[0]?.address ?? null;
}

/**
 * Ask Windows/Linux which local address it would use for a device target.
 * UDP connect does not send application data; it only asks the kernel to
 * resolve the route and exposes the selected source address. This is useful
 * when a host has both a LAN adapter and one or more routed VPN adapters.
 */
export function detectLocalIpv4ForTarget(
  targetIp: string,
  targetPort = 9,
  timeoutMs = 1000,
): Promise<string | null> {
  const target = targetIp.trim();
  if (!isIpv4Address(target)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    let settled = false;
    const timer = setTimeout(() => finish(null), Math.max(100, Math.min(3000, timeoutMs)));

    const finish = (address: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Ignore close races after an OS routing error.
      }
      resolve(address && isIpv4Address(address) ? address : null);
    };

    socket.once('error', () => finish(null));
    try {
      socket.connect(targetPort, target, () => {
        const address = socket.address();
        finish(typeof address === 'object' && address ? address.address : null);
      });
    } catch {
      finish(null);
    }
  });
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Resolve the absolute URL that devices on the local network can call.
 * `API_PUBLIC_URL` remains an explicit override for reverse proxies/NAT;
 * otherwise the current process network interfaces are detected at startup.
 */
export function resolveApiPublicBaseUrl(config: ConfigService): {
  url: string;
  configured: boolean;
} {
  const configured = config.get<string>('API_PUBLIC_URL')?.trim();
  if (configured) {
    return { url: stripTrailingSlash(configured), configured: true };
  }

  const configuredProtocol = (config.get<string>('PUBLIC_PROTOCOL') || '')
    .trim()
    .replace(/:$/, '')
    .toLowerCase();
  const protocol = ['http', 'https'].includes(configuredProtocol)
    ? configuredProtocol
    : config.get<string>('COOKIE_SECURE', 'false') === 'true'
      ? 'https'
      : 'http';
  const host = config.get<string>('PUBLIC_HOST')?.trim() || detectPrimaryIpv4() || 'localhost';
  const port = config.get<string>('API_PORT', '8010').trim() || '8010';
  const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return { url: `${protocol}://${normalizedHost}:${port}`, configured: false };
}

/**
 * Resolve an absolute API URL for a particular device route. Explicit public
 * URL/host settings remain authoritative; otherwise the OS route to the
 * target selects the VPN or LAN source address at request time.
 */
export async function resolveApiPublicBaseUrlForTarget(
  config: ConfigService,
  targetIp?: string | null,
): Promise<{ url: string; configured: boolean }> {
  const explicit = config.get<string>('API_PUBLIC_URL')?.trim();
  if (explicit) return { url: stripTrailingSlash(explicit), configured: true };

  const protocolSetting = (config.get<string>('PUBLIC_PROTOCOL') || '')
    .trim()
    .replace(/:$/, '')
    .toLowerCase();
  const protocol = ['http', 'https'].includes(protocolSetting)
    ? protocolSetting
    : config.get<string>('COOKIE_SECURE', 'false') === 'true'
      ? 'https'
      : 'http';
  const port = config.get<string>('API_PORT', '8010').trim() || '8010';
  const explicitHost = config.get<string>('PUBLIC_HOST')?.trim();
  const routeHost = targetIp ? await detectLocalIpv4ForTarget(targetIp) : null;
  const host = explicitHost || routeHost || detectPrimaryIpv4() || 'localhost';
  const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return { url: `${protocol}://${normalizedHost}:${port}`, configured: false };
}

/** Parse a comma-separated CORS allow-list, with an adaptive open default. */
export function resolveCorsOrigin(raw?: string): true | string | string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) return true;
  return origins.length === 1 ? origins[0] : origins;
}

/** Socket.IO-compatible callback that evaluates CORS after .env is loaded. */
export function adaptiveCorsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void {
  const resolved = resolveCorsOrigin(process.env.CORS_ORIGIN);
  if (resolved === true) {
    callback(null, true);
    return;
  }
  const allowed = Array.isArray(resolved) ? resolved.includes(origin ?? '') : resolved === origin;
  callback(null, allowed || !origin);
}

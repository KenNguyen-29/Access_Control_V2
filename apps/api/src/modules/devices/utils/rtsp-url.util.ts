export type CanonicalRtspUrl = {
  cleanUrl: string;
  hostname: string;
  port: number;
  username: string;
  password: string;
};

/** Normalize an RTSP URL and remove any embedded credentials. */
export function canonicalizeRtspUrl(rtspUrl: string): CanonicalRtspUrl {
  const parsed = new URL(rtspUrl.trim());
  if (!['rtsp:', 'rtsps:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('RTSP URL phải bắt đầu bằng rtsp:// hoặc rtsps://');
  }
  const port = parsed.port ? Number(parsed.port) : 554;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Cổng RTSP không hợp lệ');
  }
  const hostname = parsed.hostname;
  const username = decodeURIComponent(parsed.username || '');
  const password = decodeURIComponent(parsed.password || '');
  parsed.username = '';
  parsed.password = '';
  parsed.port = String(port);
  return {
    cleanUrl: parsed.toString(),
    hostname,
    port,
    username,
    password,
  };
}

/** Embed RTSP credentials into a credential-free RTSP URL for the streaming server to pull from. */
export function buildRtspUrlWithCredentials(
  rtspUrl: string,
  username?: string | null,
  password?: string | null,
): string {
  const parsed = new URL(rtspUrl.trim());
  if (!['rtsp:', 'rtsps:'].includes(parsed.protocol)) return rtspUrl.trim();
  if (username) {
    parsed.username = username;
    parsed.password = password ?? '';
  }
  return parsed.toString();
}

/** Hide credentials from an RTSP URL for safe logging. */
export function redactRtspUrl(rtspUrl: string): string {
  return rtspUrl.replace(/^(rtsps?):\/\/[^@/]+@/i, '$1://***:***@');
}

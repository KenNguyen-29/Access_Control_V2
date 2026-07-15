/** Embed RTSP credentials into a credential-free RTSP URL for the streaming server to pull from. */
export function buildRtspUrlWithCredentials(
  rtspUrl: string,
  username?: string | null,
  password?: string | null,
): string {
  const trimmed = rtspUrl.trim();
  if (!username) return trimmed;
  const creds = `${encodeURIComponent(username)}:${encodeURIComponent(password ?? '')}`;
  return trimmed.replace(/^rtsp:\/\//i, `rtsp://${creds}@`);
}

/** Hide credentials from an RTSP URL for safe logging. */
export function redactRtspUrl(rtspUrl: string): string {
  return rtspUrl.replace(/^rtsp:\/\/[^@/]+@/i, 'rtsp://***:***@');
}

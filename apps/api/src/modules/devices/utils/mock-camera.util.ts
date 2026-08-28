/**
 * Resolve a virtual camera URL to a local test source without changing the
 * address stored for the device. This is deliberately opt-in so production
 * cameras are never redirected by accident.
 */
export type MockCameraSourceOptions = {
  enabled: boolean;
  virtualIp: string;
  source: string;
  username?: string;
  password?: string;
};

export function resolveMockCameraSource(
  rtspUrl: string,
  options: MockCameraSourceOptions,
): string {
  const input = rtspUrl.trim();
  if (!options.enabled || !options.virtualIp.trim() || !options.source.trim()) return input;

  try {
    const parsed = new URL(input);
    if (parsed.hostname !== options.virtualIp.trim()) return input;
    const source = options.source.trim();
    if (!options.username?.trim() || !/^rtsps?:\/\//i.test(source)) return source;
    try {
      const sourceUrl = new URL(source);
      if (!sourceUrl.username) {
        sourceUrl.username = options.username.trim();
        sourceUrl.password = options.password ?? '';
      }
      return sourceUrl.toString();
    } catch {
      return source;
    }
  } catch {
    return input;
  }
}

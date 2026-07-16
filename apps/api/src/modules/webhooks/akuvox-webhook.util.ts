import { AkuvoxWebhookPayload } from '@acv2/shared';

/** Parse Akuvox Action URL colon-separated pairs, e.g. mac=AA:ip=1.2.3.4:active_user=NV-0001 */
export function parseAkuvoxColonPairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = raw.trim();
  if (!text) return out;

  for (const part of text.split(':')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** Normalize JSON body, query string, or Akuvox Action URL into a webhook payload. */
export function normalizeAkuvoxWebhookPayload(
  body: Record<string, unknown> | undefined,
  query: Record<string, unknown> | undefined,
  rawUrl?: string,
): AkuvoxWebhookPayload {
  const merged: Record<string, string> = {};

  const absorb = (source?: Record<string, unknown>) => {
    if (!source) return;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        merged[key] = String(value);
      }
    }
  };

  absorb(query);
  absorb(body);

  if (rawUrl) {
    try {
      const url = new URL(rawUrl, 'http://localhost');
      absorb(Object.fromEntries(url.searchParams.entries()));
      const pathTail = url.pathname.replace(/^\/api\/webhooks\/akuvox\/?/i, '');
      if (pathTail && pathTail !== '/' && pathTail !== 'akuvox') {
        Object.assign(merged, parseAkuvoxColonPairs(pathTail));
      }
    } catch {
      // ignore malformed URL
    }
  }

  for (const value of Object.values({ ...merged })) {
    if (value.includes(':') && value.includes('=')) {
      Object.assign(merged, parseAkuvoxColonPairs(value));
    }
  }

  const employeeCode = firstString(
    merged.employeeCode,
    merged.userId,
    merged.UserID,
    merged.active_user,
    merged.activeUser,
    merged.user,
    merged.card_sn,
    merged.validcard,
  );

  const deviceCode = firstString(merged.deviceCode, merged.deviceId, merged.DeviceID);
  const deviceIp = firstString(merged.ip, merged.deviceIp, merged.device_ip);

  const payload: AkuvoxWebhookPayload = {
    ...merged,
    employeeCode,
    userId: employeeCode,
    deviceCode,
    deviceId: deviceCode,
    timestamp: firstString(merged.timestamp, merged.time, merged.eventTime) ?? new Date().toISOString(),
    eventId: firstString(
      merged.eventId,
      merged.event,
      merged.active_url,
      `${employeeCode ?? 'unknown'}-${deviceIp ?? deviceCode ?? 'device'}-${Date.now()}`,
    ),
    eventType: firstString(merged.eventType, merged.event, merged.active_url),
  };

  if (deviceIp) {
    payload.deviceIp = deviceIp;
  }

  return payload;
}

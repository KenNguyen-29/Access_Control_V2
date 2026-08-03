import { parseVietnamWallClock } from '../../common/utils/vn-time.util';

export type AkuvoxDoorLogPayload = {
  Type?: string;
  UserID?: string;
  Name?: string;
  Status?: string;
  Date?: string;
  Time?: string;
  Code?: string;
  Relay?: string;
};

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function findValue(source: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = trim(source[key]);
    if (value) return value;
  }
  return '';
}

export function buildDoorLogFromMap(source: Record<string, string>): AkuvoxDoorLogPayload | null {
  if (!source || Object.keys(source).length === 0) return null;

  const dto: AkuvoxDoorLogPayload = {
    Type: findValue(source, 'Type', 'type'),
    UserID: findValue(source, 'UserID', 'userId', 'userid'),
    Name: findValue(source, 'Name', 'name'),
    Status: findValue(source, 'Status', 'status'),
    Code: findValue(source, 'Code', 'code'),
    Date: findValue(source, 'Date', 'date'),
    Time: findValue(source, 'Time', 'time'),
    Relay: findValue(source, 'Relay', 'relay'),
  };

  const hasAnyField = Object.values(dto).some((value) => trim(value));
  return hasAnyField ? dto : null;
}

export function parseDoorLogJson(raw: string): AkuvoxDoorLogPayload | null {
  const text = trim(raw);
  if (!text) return null;

  try {
    let jsonText = text;
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = text.slice(firstBrace, lastBrace + 1);
    }
    if (!jsonText.startsWith('{')) return null;

    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return buildDoorLogFromMap(
      Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, value == null ? '' : String(value)]),
      ),
    );
  } catch {
    return null;
  }
}

export function parseFormEncodedPayload(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const text = trim(raw);
  if (!text || !text.includes('=')) return parsed;

  for (const pair of text.split('&')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = decodeURIComponent(pair.slice(0, idx).trim());
    const value = decodeURIComponent(pair.slice(idx + 1).trim());
    if (key) parsed[key] = value;
  }
  return parsed;
}

export function isFaceDoorLogEvent(dto: AkuvoxDoorLogPayload): boolean {
  return trim(dto.Type).toLowerCase() === 'face';
}

export function isDoorLogSuccess(dto: AkuvoxDoorLogPayload): boolean {
  return trim(dto.Status).toLowerCase() === 'success';
}

export function normalizedDoorLogUserId(dto: AkuvoxDoorLogPayload): string {
  const userId = trim(dto.UserID);
  if (!userId || userId === '-') return '';
  return userId.toUpperCase();
}

export function buildDoorLogEventTime(dto: AkuvoxDoorLogPayload): Date {
  const date = trim(dto.Date);
  const time = trim(dto.Time);
  if (date && time) {
    const parsed = parseVietnamWallClock(date, time);
    if (parsed) return parsed;
  }
  if (date) {
    const parsed = parseVietnamWallClock(date);
    if (parsed) return parsed;
  }
  return new Date();
}

export function buildDoorLogSourceEventId(dto: AkuvoxDoorLogPayload, clientIp: string): string {
  const userId = normalizedDoorLogUserId(dto) || 'unknown';
  const date = trim(dto.Date) || 'nodate';
  const time = trim(dto.Time) || 'notime';
  return `${userId}-${clientIp}-${date}-${time}`;
}

export function extractClientIp(
  remoteAddress?: string,
  forwardedFor?: string | string[],
): string {
  const forwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : trim(forwardedFor);
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || '';
  }
  const ip = trim(remoteAddress);
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

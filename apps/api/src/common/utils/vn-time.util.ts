/** Vietnam business timezone for attendance / shift calendar math. No DST. */
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const VN_UTC_OFFSET = '+07:00';

export type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Read calendar/clock parts of an absolute instant in Asia/Ho_Chi_Minh. */
export function zonedPartsInVietnam(date: Date): ZonedDateTimeParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: VN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function vietnamClockMinutes(date: Date): number {
  const p = zonedPartsInVietnam(date);
  return p.hour * 60 + p.minute;
}

export function vietnamDateOnlyUtcMidnight(date: Date): Date {
  const p = zonedPartsInVietnam(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

export function vietnamDateOnlyString(date: Date = new Date()): string {
  const p = zonedPartsInVietnam(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Parse a wall-clock date/time as Vietnam local time into an absolute Date.
 * Accepts `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `YYYY-MM-DDTHH:mm:ss`.
 */
export function parseVietnamWallClock(date: string, time?: string): Date | null {
  const d = date.trim();
  if (!d) return null;

  let wall = d;
  if (time?.trim()) {
    let t = time.trim();
    if (/^\d{2}:\d{2}$/.test(t)) t = `${t}:00`;
    wall = `${d}T${t}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    wall = `${d}T00:00:00`;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(wall)) return null;
  if (wall.length === 16) wall = `${wall}:00`;

  const parsed = new Date(`${wall}${VN_UTC_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

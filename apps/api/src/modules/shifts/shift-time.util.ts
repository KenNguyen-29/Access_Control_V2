/** Work-shift time helpers (HH:mm). Shared by web validation + API. */

export function timeToMinutes(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function normalizeHhMm(hhmm: string): string {
  const mins = timeToMinutes(hhmm);
  if (mins === null) return hhmm.trim();
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Half-open intervals [start, end) in minutes from midnight (0–1440). */
export function shiftTimeIntervals(
  startTime: string,
  endTime: string,
  isOvernight: boolean,
): Array<[number, number]> | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return null;

  const overnight = isOvernight || end <= start;
  if (!overnight) {
    if (start === end) return null; // zero length
    return [[start, end]];
  }
  // Overnight: start→midnight and midnight→end. start===end → full day.
  if (start === end) return [[0, 1440]];
  return [
    [start, 1440],
    [0, end],
  ];
}

function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export type ShiftTimeWindow = {
  id?: string;
  name?: string;
  code?: string;
  startTime: string;
  endTime: string;
  isOvernight?: boolean;
};

export function shiftsTimeOverlap(a: ShiftTimeWindow, b: ShiftTimeWindow): boolean {
  const ia = shiftTimeIntervals(a.startTime, a.endTime, Boolean(a.isOvernight));
  const ib = shiftTimeIntervals(b.startTime, b.endTime, Boolean(b.isOvernight));
  if (!ia || !ib) return false;
  return ia.some((x) => ib.some((y) => intervalsOverlap(x, y)));
}

export function findOverlappingShift(
  candidate: ShiftTimeWindow,
  existing: ShiftTimeWindow[],
  excludeId?: string,
): ShiftTimeWindow | null {
  for (const other of existing) {
    if (excludeId && other.id === excludeId) continue;
    if (shiftsTimeOverlap(candidate, other)) return other;
  }
  return null;
}

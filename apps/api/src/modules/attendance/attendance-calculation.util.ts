/**
 * Single source of truth for attendance time/status math.
 * Shift end is always workDate + endTime (plus +1 day when overnight).
 */

import { AttendanceStatus } from '@prisma/client';

export type ShiftLike = {
  startTime: string;
  endTime: string;
  breakMinutes?: number | null;
  gracePeriodMinutes?: number | null;
  isOvernight?: boolean | null;
};

export type AttendanceMetrics = {
  lateMinutes: number;
  earlyLeaveMinutes: number;
  otMinutes: number;
  earlyArrivalMinutes: number;
  workedMinutes: number;
  status: AttendanceStatus;
};

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function eventClockMinutes(eventTime: Date): number {
  return eventTime.getHours() * 60 + eventTime.getMinutes();
}

export function isOvernightShift(shift: ShiftLike): boolean {
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  return Boolean(shift.isOvernight) || end <= start;
}

/** Continuous minutes from work-day midnight: start stays as-is; overnight end += 1440. */
export function shiftEndContinuousMinutes(shift: ShiftLike): number {
  const end = timeToMinutes(shift.endTime);
  return isOvernightShift(shift) ? end + 24 * 60 : end;
}

export function shiftStartMinutes(shift: ShiftLike): number {
  return timeToMinutes(shift.startTime);
}

/**
 * Place an event on the continuous timeline of the shift work day.
 * Evening punches stay on day-0; early-morning overnight punches get +1440.
 */
export function eventContinuousMinutes(shift: ShiftLike, eventTime: Date): number {
  const clock = eventClockMinutes(eventTime);
  if (isOvernightShift(shift) && clock < shiftStartMinutes(shift)) {
    return clock + 24 * 60;
  }
  return clock;
}

/** Calendar work date (UTC midnight) for a punch, overnight-aware. */
export function resolveWorkDateForPunch(shift: ShiftLike | null, eventTime: Date): Date {
  const local = new Date(
    eventTime.getFullYear(),
    eventTime.getMonth(),
    eventTime.getDate(),
  );
  if (shift && isOvernightShift(shift)) {
    const clock = eventClockMinutes(eventTime);
    if (clock < shiftStartMinutes(shift)) {
      local.setDate(local.getDate() - 1);
    }
  }
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

export function formatDateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeLateMinutes(shift: ShiftLike, checkInAt: Date): number {
  const start = shiftStartMinutes(shift);
  const grace = Math.max(0, shift.gracePeriodMinutes ?? 0);
  const event = eventContinuousMinutes(shift, checkInAt);
  return Math.max(0, event - (start + grace));
}

export function computeEarlyArrivalMinutes(
  checkInAt: Date | null,
  shift: ShiftLike | null | undefined,
): number {
  if (!checkInAt || !shift) return 0;
  const start = shiftStartMinutes(shift);
  const clock = eventClockMinutes(checkInAt);
  // Early arrival only on the same evening segment (before start, not after-midnight).
  if (isOvernightShift(shift) && clock < start) return 0;
  return Math.max(0, start - clock);
}

export type EarlyLeaveOtOptions = {
  /** Minutes before shift end that still count as on-time leave. */
  earlyLeaveGraceMinutes?: number;
  /** Minutes after shift end before OT starts counting. */
  otAfterMinutes?: number;
};

export function computeEarlyLeaveAndOt(
  shift: ShiftLike,
  checkOutAt: Date,
  options: EarlyLeaveOtOptions = {},
): { earlyLeaveMinutes: number; otMinutes: number } {
  const end = shiftEndContinuousMinutes(shift);
  const event = eventContinuousMinutes(shift, checkOutAt);
  const earlyGrace = Math.max(0, options.earlyLeaveGraceMinutes ?? 0);
  const otAfter = Math.max(0, options.otAfterMinutes ?? 0);

  if (event < end) {
    return {
      earlyLeaveMinutes: Math.max(0, end - event - earlyGrace),
      otMinutes: 0,
    };
  }

  return {
    earlyLeaveMinutes: 0,
    otMinutes: Math.max(0, event - (end + otAfter)),
  };
}

export function computeWorkedMinutes(
  workDate: Date,
  checkInAt: Date | null,
  checkOutAt: Date | null,
  breakMinutes: number,
  asOf: Date = new Date(),
): number {
  if (!checkInAt) return 0;

  if (!checkOutAt) {
    const workDateKey = formatDateOnlyUtc(
      new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate())),
    );
    const todayKey = [
      asOf.getFullYear(),
      String(asOf.getMonth() + 1).padStart(2, '0'),
      String(asOf.getDate()).padStart(2, '0'),
    ].join('-');
    if (workDateKey !== todayKey) return 0;
    const liveRaw = (asOf.getTime() - checkInAt.getTime()) / 60000;
    return liveRaw > 0 ? Math.round(liveRaw) : 0;
  }

  const raw = (checkOutAt.getTime() - checkInAt.getTime()) / 60000 - Math.max(0, breakMinutes);
  return raw > 0 ? Math.round(raw) : 0;
}

export function computeAttendanceStatus(params: {
  lateMinutes: number;
  earlyLeaveMinutes: number;
  otMinutes: number;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  explicit?: AttendanceStatus | null;
}): AttendanceStatus {
  if (params.explicit) return params.explicit;
  if (!params.checkInAt && !params.checkOutAt) return AttendanceStatus.ABSENT;
  if (params.otMinutes > 0) return AttendanceStatus.OVERTIME;
  if (params.earlyLeaveMinutes > 0) return AttendanceStatus.EARLY_LEAVE;
  if (params.lateMinutes > 0) return AttendanceStatus.LATE;
  return AttendanceStatus.ON_TIME;
}

/** Working-day credit used by matrix/reports (CN > OT > late > on-time). */
export function computeWorkingDayCredit(params: {
  date: Date | string;
  status: string;
  lateMinutes: number;
  otMinutes: number;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number;
  otMultiplier?: number;
}): { kind: 'sunday' | 'ot' | 'late' | 'onTime' | null; cong: number } {
  const present =
    params.status !== 'ABSENT' &&
    !!(params.checkInAt || params.checkOutAt || params.workedMinutes > 0);
  if (!present) return { kind: null, cong: 0 };

  const d =
    typeof params.date === 'string'
      ? new Date(`${params.date.slice(0, 10)}T00:00:00`)
      : params.date;
  const otCong = params.otMultiplier ?? 1.25;
  if (d.getDay() === 0) return { kind: 'sunday', cong: 1.5 };
  if (params.otMinutes > 0 || params.status === 'OVERTIME') return { kind: 'ot', cong: otCong };
  if (params.lateMinutes > 0 || params.status === 'LATE') return { kind: 'late', cong: 0.5 };
  return { kind: 'onTime', cong: 1 };
}

export function computeMetricsFromTimes(
  shift: ShiftLike | null,
  checkInAt: Date | null,
  checkOutAt: Date | null,
  workDate?: Date,
  asOf: Date = new Date(),
  options: EarlyLeaveOtOptions = {},
): AttendanceMetrics {
  if (!shift) {
    return {
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      otMinutes: 0,
      earlyArrivalMinutes: 0,
      workedMinutes: computeWorkedMinutes(
        workDate ?? (checkInAt ? resolveWorkDateForPunch(null, checkInAt) : new Date()),
        checkInAt,
        checkOutAt,
        0,
        asOf,
      ),
      status: computeAttendanceStatus({
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        otMinutes: 0,
        checkInAt,
        checkOutAt,
      }),
    };
  }

  const lateMinutes = checkInAt ? computeLateMinutes(shift, checkInAt) : 0;
  const earlyArrivalMinutes = computeEarlyArrivalMinutes(checkInAt, shift);
  const { earlyLeaveMinutes, otMinutes } = checkOutAt
    ? computeEarlyLeaveAndOt(shift, checkOutAt, options)
    : { earlyLeaveMinutes: 0, otMinutes: 0 };
  const wd =
    workDate ??
    (checkInAt ? resolveWorkDateForPunch(shift, checkInAt) : new Date());
  const workedMinutes = computeWorkedMinutes(
    wd,
    checkInAt,
    checkOutAt,
    shift.breakMinutes ?? 0,
    asOf,
  );
  const status = computeAttendanceStatus({
    lateMinutes,
    earlyLeaveMinutes,
    otMinutes,
    checkInAt,
    checkOutAt,
  });

  return {
    lateMinutes,
    earlyLeaveMinutes,
    otMinutes,
    earlyArrivalMinutes,
    workedMinutes,
    status,
  };
}

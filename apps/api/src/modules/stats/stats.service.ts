import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface StatsOverview {
  users: number;
  devices: number;
  cameras: number;
  akuvox: number;
  workShifts: number;
  activeAssignments: number;
  todayAttendance: number;
  todayLate: number;
  todayEvents: number;
  todayInvalidEvents: number;
}

export interface AttendanceSummaryTotals {
  totalRecords: number;
  staffCount: number;
  presentCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  absentCount: number;
  otMinutes: number;
  workedMinutes: number;
}

export interface TimesheetRow {
  userId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string | null;
  daysWorked: number;
  workedMinutes: number;
  lateCount: number;
  earlyCount: number;
  otMinutes: number;
}

export interface AttendanceSummary {
  summary: AttendanceSummaryTotals;
  timesheet: TimesheetRow[];
}

export interface WeeklyRow {
  userId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string | null;
  date: string;
  weekday: number;
  shiftName: string | null;
  shiftCode: string | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  otMinutes: number;
  workedMinutes: number;
  salaryCoefficient: number;
  status: string;
}

export interface WeeklyTimesheet {
  weekStart: string;
  weekEnd: string;
  rows: WeeklyRow[];
}

function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateOnly(value: string, fallback: Date): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    const f = fallback;
    return new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()));
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** Worked minutes; if still checked in, counts up to now (live partial hours). */
function computeWorkedMinutes(
  workDate: Date,
  checkInAt: Date | null,
  checkOutAt: Date | null,
  breakMinutes: number,
  asOf: Date = new Date(),
): number {
  if (!checkInAt) return 0;

  if (!checkOutAt) {
    const workDateKey = formatDateOnly(workDate);
    const todayKey = [
      asOf.getFullYear(),
      String(asOf.getMonth() + 1).padStart(2, '0'),
      String(asOf.getDate()).padStart(2, '0'),
    ].join('-');
    if (workDateKey !== todayKey) return 0;

    const liveRaw = (asOf.getTime() - checkInAt.getTime()) / 60000;
    return liveRaw > 0 ? Math.round(liveRaw) : 0;
  }

  const raw = (checkOutAt.getTime() - checkInAt.getTime()) / 60000 - breakMinutes;
  return raw > 0 ? Math.round(raw) : 0;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<StatsOverview> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const [
      users,
      cameras,
      akuvox,
      workShifts,
      activeAssignments,
      todayAttendance,
      todayLate,
      todayEvents,
      todayInvalidEvents,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isDeleted: false } }),
      this.prisma.device.count({ where: { isDeleted: false, deviceType: 'CAMERA' } }),
      this.prisma.device.count({ where: { isDeleted: false, deviceType: 'AKUVOX' } }),
      this.prisma.workShift.count({ where: { isDeleted: false } }),
      this.prisma.employeeShift.count({
        where: { isDeleted: false, OR: [{ endDate: null }, { endDate: { gte: startOfDay } }] },
      }),
      this.prisma.attendanceRecord.count({ where: { date: { gte: startOfDay, lt: endOfDay } } }),
      this.prisma.attendanceRecord.count({
        where: { date: { gte: startOfDay, lt: endOfDay }, status: 'LATE' },
      }),
      this.prisma.accessLog.count({ where: { eventAt: { gte: startOfDay, lt: endOfDay } } }),
      this.prisma.accessLog.count({
        where: { eventAt: { gte: startOfDay, lt: endOfDay }, isValid: false },
      }),
    ]);

    return {
      users,
      devices: cameras + akuvox,
      cameras,
      akuvox,
      workShifts,
      activeAssignments,
      todayAttendance,
      todayLate,
      todayEvents,
      todayInvalidEvents,
    };
  }

  async attendanceSummary(params: {
    from?: string;
    to?: string;
    departmentId?: string;
  }): Promise<AttendanceSummary> {
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const from = parseDateOnly(params.from ?? '', defaultFrom);
    const toBase = parseDateOnly(params.to ?? '', now);
    const to = new Date(toBase);
    to.setUTCDate(to.getUTCDate() + 1);

    const asOf = new Date();
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        date: { gte: from, lt: to },
        ...(params.departmentId ? { user: { departmentId: params.departmentId } } : {}),
      },
      include: {
        user: { include: { department: true } },
        workShift: true,
      },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    });

    const summary: AttendanceSummaryTotals = {
      totalRecords: records.length,
      staffCount: 0,
      presentCount: 0,
      lateCount: 0,
      earlyLeaveCount: 0,
      absentCount: 0,
      otMinutes: 0,
      workedMinutes: 0,
    };

    const byUser = new Map<string, TimesheetRow>();

    for (const r of records) {
      const worked = computeWorkedMinutes(
        r.date,
        r.checkInAt,
        r.checkOutAt,
        r.workShift?.breakMinutes ?? 0,
        asOf,
      );

      if (r.status !== 'ABSENT') summary.presentCount += 1;
      if (r.status === 'ABSENT') summary.absentCount += 1;
      if (r.lateMinutes > 0 || r.status === 'LATE') summary.lateCount += 1;
      if (r.earlyLeaveMinutes > 0 || r.status === 'EARLY_LEAVE') summary.earlyLeaveCount += 1;
      summary.otMinutes += r.otMinutes;
      summary.workedMinutes += worked;

      let row = byUser.get(r.userId);
      if (!row) {
        row = {
          userId: r.userId,
          fullName: r.user?.fullName ?? r.userId,
          employeeCode: r.user?.employeeCode ?? '',
          departmentName: r.user?.department?.name ?? null,
          daysWorked: 0,
          workedMinutes: 0,
          lateCount: 0,
          earlyCount: 0,
          otMinutes: 0,
        };
        byUser.set(r.userId, row);
      }
      if (r.status !== 'ABSENT') row.daysWorked += 1;
      row.workedMinutes += worked;
      if (r.lateMinutes > 0 || r.status === 'LATE') row.lateCount += 1;
      if (r.earlyLeaveMinutes > 0 || r.status === 'EARLY_LEAVE') row.earlyCount += 1;
      row.otMinutes += r.otMinutes;
    }

    summary.staffCount = byUser.size;

    const timesheet = Array.from(byUser.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'vi'),
    );

    return { summary, timesheet };
  }

  async weeklyTimesheet(params: {
    weekStart?: string;
    departmentId?: string;
  }): Promise<WeeklyTimesheet> {
    const now = new Date();
    const defaultStart = new Date(now);
    const day = defaultStart.getDay();
    const diff = (day + 6) % 7;
    defaultStart.setDate(defaultStart.getDate() - diff);
    const weekStart = parseDateOnly(params.weekStart ?? '', defaultStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const asOf = new Date();
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        date: { gte: weekStart, lt: weekEnd },
        ...(params.departmentId ? { user: { departmentId: params.departmentId } } : {}),
      },
      include: {
        user: { include: { department: true } },
        workShift: true,
      },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    });

    const rows: WeeklyRow[] = records.map((r) => ({
      userId: r.userId,
      fullName: r.user?.fullName ?? r.userId,
      employeeCode: r.user?.employeeCode ?? '',
      departmentName: r.user?.department?.name ?? null,
      date: formatDateOnly(r.date),
      weekday: r.date.getUTCDay(),
      shiftName: r.workShift?.name ?? null,
      shiftCode: r.workShift?.code ?? null,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      lateMinutes: r.lateMinutes,
      earlyLeaveMinutes: r.earlyLeaveMinutes,
      otMinutes: r.otMinutes,
      workedMinutes: computeWorkedMinutes(
        r.date,
        r.checkInAt,
        r.checkOutAt,
        r.workShift?.breakMinutes ?? 0,
        asOf,
      ),
      salaryCoefficient: r.workShift?.salaryCoefficient ?? 1,
      status: r.status,
    }));

    rows.sort((a, b) => {
      const byName = a.fullName.localeCompare(b.fullName, 'vi');
      if (byName !== 0) return byName;
      return a.date.localeCompare(b.date);
    });

    const weekEndDisplay = new Date(weekEnd);
    weekEndDisplay.setUTCDate(weekEndDisplay.getUTCDate() - 1);

    return {
      weekStart: formatDateOnly(weekStart),
      weekEnd: formatDateOnly(weekEndDisplay),
      rows,
    };
  }
}

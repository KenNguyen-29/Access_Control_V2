import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCalculationService } from '../attendance/attendance-calculation.service';

export interface StatsOverview {
  users: number;
  devices: number;
  cameras: number;
  akuvox: number;
  workShifts: number;
  activeAssignments: number;
  /** Users with no EmployeeShift active today (UI: endDate null or endDate > today). */
  unassignedEmployees: number;
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
  /** Số ngày đi sớm (check-in trước giờ ca). */
  earlyArrivalCount: number;
  /** Số ngày về sớm. */
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
  /** Minutes checked in before shift start. */
  earlyArrivalMinutes: number;
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

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: AttendanceCalculationService,
  ) {}

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
      assignedUserRows,
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
      // Match shifts UI isAssignmentActive: endDate null OR endDate > today (ended-on-today = not active).
      this.prisma.employeeShift.findMany({
        where: {
          isDeleted: false,
          startDate: { lte: startOfDay },
          OR: [{ endDate: null }, { endDate: { gt: startOfDay } }],
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.attendanceRecord.count({
        where: { date: { gte: startOfDay, lt: endOfDay }, workShiftId: { not: null } },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          date: { gte: startOfDay, lt: endOfDay },
          workShiftId: { not: null },
          status: 'LATE',
        },
      }),
      this.prisma.accessLog.count({ where: { eventAt: { gte: startOfDay, lt: endOfDay } } }),
      this.prisma.accessLog.count({
        where: { eventAt: { gte: startOfDay, lt: endOfDay }, isValid: false },
      }),
    ]);

    const unassignedEmployees = Math.max(0, users - assignedUserRows.length);

    return {
      users,
      devices: cameras + akuvox,
      cameras,
      akuvox,
      workShifts,
      activeAssignments,
      unassignedEmployees,
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
    contractorId?: string;
    projectId?: string;
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
        workShiftId: { not: null },
        date: { gte: from, lt: to },
        ...(params.departmentId || params.contractorId || params.projectId
          ? {
              user: {
                ...(params.departmentId ? { departmentId: params.departmentId } : {}),
                ...(params.contractorId ? { contractorId: params.contractorId } : {}),
                ...(params.projectId ? { projectId: params.projectId } : {}),
              },
            }
          : {}),
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
    const policy = await this.calc.getPolicyOptions();

    for (const r of records) {
      const effective = r.workShift
        ? this.calc.applyLateGraceFloor(r.workShift, policy.lateGraceFloor)
        : null;
      const metrics = this.calc.computeMetricsFromTimes(
        effective,
        r.checkInAt,
        r.checkOutAt,
        r.date,
        asOf,
        {
          earlyLeaveGraceMinutes: policy.earlyLeaveGraceMinutes,
          otAfterMinutes: policy.otAfterMinutes,
        },
      );
      const lateMinutes = metrics.lateMinutes;
      const earlyLeaveMinutes = metrics.earlyLeaveMinutes;
      const otMinutes = metrics.otMinutes;
      const worked = metrics.workedMinutes;
      const status = metrics.status;

      if (status !== 'ABSENT') summary.presentCount += 1;
      if (status === 'ABSENT') summary.absentCount += 1;
      if (lateMinutes > 0 || status === 'LATE') summary.lateCount += 1;
      if (earlyLeaveMinutes > 0 || status === 'EARLY_LEAVE') summary.earlyLeaveCount += 1;
      summary.otMinutes += otMinutes;
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
          earlyArrivalCount: 0,
          earlyCount: 0,
          otMinutes: 0,
        };
        byUser.set(r.userId, row);
      }
      if (status !== 'ABSENT') row.daysWorked += 1;
      row.workedMinutes += worked;
      if (lateMinutes > 0 || status === 'LATE') row.lateCount += 1;
      if (metrics.earlyArrivalMinutes > 0) {
        row.earlyArrivalCount += 1;
      }
      if (earlyLeaveMinutes > 0 || status === 'EARLY_LEAVE') row.earlyCount += 1;
      row.otMinutes += otMinutes;
    }

    summary.staffCount = byUser.size;

    const timesheet = Array.from(byUser.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'vi'),
    );

    return { summary, timesheet };
  }

  async weeklyTimesheet(params: {
    weekStart?: string;
    from?: string;
    to?: string;
    departmentId?: string;
    contractorId?: string;
    projectId?: string;
  }): Promise<WeeklyTimesheet> {
    const now = new Date();
    let rangeStart: Date;
    let rangeEndExclusive: Date;

    if (params.from && params.to) {
      rangeStart = parseDateOnly(params.from, now);
      const toBase = parseDateOnly(params.to, now);
      rangeEndExclusive = new Date(toBase);
      rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);
    } else {
      const defaultStart = new Date(now);
      const day = defaultStart.getDay();
      const diff = (day + 6) % 7;
      defaultStart.setDate(defaultStart.getDate() - diff);
      rangeStart = parseDateOnly(params.weekStart ?? '', defaultStart);
      rangeEndExclusive = new Date(rangeStart);
      rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 7);
    }

    const asOf = new Date();
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        workShiftId: { not: null },
        date: { gte: rangeStart, lt: rangeEndExclusive },
        ...(params.departmentId || params.contractorId || params.projectId
          ? {
              user: {
                ...(params.departmentId ? { departmentId: params.departmentId } : {}),
                ...(params.contractorId ? { contractorId: params.contractorId } : {}),
                ...(params.projectId ? { projectId: params.projectId } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { include: { department: true } },
        workShift: true,
      },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    });

    const policy = await this.calc.getPolicyOptions();
    const rows: WeeklyRow[] = records.map((r) => {
      const effective = r.workShift
        ? this.calc.applyLateGraceFloor(r.workShift, policy.lateGraceFloor)
        : null;
      const metrics = this.calc.computeMetricsFromTimes(
        effective,
        r.checkInAt,
        r.checkOutAt,
        r.date,
        asOf,
        {
          earlyLeaveGraceMinutes: policy.earlyLeaveGraceMinutes,
          otAfterMinutes: policy.otAfterMinutes,
        },
      );
      return {
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
        lateMinutes: metrics.lateMinutes,
        earlyArrivalMinutes: metrics.earlyArrivalMinutes,
        earlyLeaveMinutes: metrics.earlyLeaveMinutes,
        otMinutes: metrics.otMinutes,
        workedMinutes: metrics.workedMinutes,
        salaryCoefficient: r.workShift?.salaryCoefficient ?? 1,
        status: metrics.status,
      };
    });

    rows.sort((a, b) => {
      const byName = a.fullName.localeCompare(b.fullName, 'vi');
      if (byName !== 0) return byName;
      return a.date.localeCompare(b.date);
    });

    const rangeEndDisplay = new Date(rangeEndExclusive);
    rangeEndDisplay.setUTCDate(rangeEndDisplay.getUTCDate() - 1);

    return {
      weekStart: formatDateOnly(rangeStart),
      weekEnd: formatDateOnly(rangeEndDisplay),
      rows,
    };
  }
}

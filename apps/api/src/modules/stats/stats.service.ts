import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCalculationService } from '../attendance/attendance-calculation.service';
import { attachPunchLocations } from '../attendance/punch-location.util';

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
  /** Tổng nhà thầu / dự án (chưa xóa). */
  contractors: number;
  projects: number;
  /** Top nhà thầu theo số nhân sự (đã gán contractorId). */
  staffByContractor: Array<{ id: string; name: string; count: number }>;
  todayCheckIns: number;
  todayCheckOuts: number;
  /** Bản ghi hôm nay có ca, đã check-in, không muộn. */
  todayOnTime: number;
  /** Bản ghi hôm nay đi sớm (check-in trước giờ ca). */
  todayEarly: number;
}

export interface HomeZoneStat {
  id: string;
  name: string;
  parentZoneId: string | null;
  presentCount: number;
  deviceTotal: number;
  devicesOnline: number;
  todayEvents: number;
  todayInvalid: number;
}

export interface HomeDashboard {
  from: string;
  to: string;
  overview: StatsOverview;
  zones: HomeZoneStat[];
  traffic7d: Array<{ date: string; checkIns: number; checkOuts: number }>;
  periodSummary: {
    checkIns: number;
    checkOuts: number;
    invalidEvents: number;
  };
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
  zoneName: string | null;
  deviceName: string | null;
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

function parseLocalDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      dnake,
      workShifts,
      activeAssignments,
      assignedUserRows,
      todayAttendance,
      todayLate,
      todayEvents,
      todayInvalidEvents,
      contractors,
      projects,
      staffByContractorGroups,
      todayCheckIns,
      todayCheckOuts,
      todayOnTime,
      todayRecordsForEarly,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isDeleted: false } }),
      this.prisma.device.count({ where: { isDeleted: false, deviceType: 'CAMERA' } }),
      this.prisma.device.count({ where: { isDeleted: false, deviceType: 'AKUVOX' } }),
      this.prisma.device.count({ where: { isDeleted: false, deviceType: 'DNAKE' } }),
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
      this.prisma.contractor.count({ where: { isDeleted: false } }),
      this.prisma.project.count({ where: { isDeleted: false } }),
      this.prisma.user.groupBy({
        by: ['contractorId'],
        where: { isDeleted: false, contractorId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { contractorId: 'desc' } },
        take: 8,
      }),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: startOfDay, lt: endOfDay },
          action: 'CHECK_IN',
        },
      }),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: startOfDay, lt: endOfDay },
          action: 'CHECK_OUT',
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          date: { gte: startOfDay, lt: endOfDay },
          workShiftId: { not: null },
          checkInAt: { not: null },
          lateMinutes: 0,
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          date: { gte: startOfDay, lt: endOfDay },
          workShiftId: { not: null },
          checkInAt: { not: null },
        },
        select: {
          checkInAt: true,
          workShift: {
            select: {
              startTime: true,
              endTime: true,
              isOvernight: true,
              gracePeriodMinutes: true,
            },
          },
        },
      }),
    ]);

    const contractorIds = staffByContractorGroups
      .map((g) => g.contractorId)
      .filter((id): id is string => Boolean(id));
    const contractorRows =
      contractorIds.length > 0
        ? await this.prisma.contractor.findMany({
            where: { id: { in: contractorIds } },
            select: { id: true, name: true },
          })
        : [];
    const contractorNameById = new Map(contractorRows.map((c) => [c.id, c.name]));
    const staffByContractor = staffByContractorGroups
      .filter((g) => g.contractorId)
      .map((g) => ({
        id: g.contractorId!,
        name: contractorNameById.get(g.contractorId!) ?? '—',
        count: g._count._all,
      }));

    const policy = await this.calc.getPolicyOptions();
    let todayEarly = 0;
    for (const r of todayRecordsForEarly) {
      if (!r.workShift || !r.checkInAt) continue;
      const effective = this.calc.applyLateGraceFloor(r.workShift, policy.lateGraceFloor);
      if (this.calc.computeEarlyArrivalMinutes(r.checkInAt, effective) > 0) {
        todayEarly += 1;
      }
    }

    const unassignedEmployees = Math.max(0, users - assignedUserRows.length);

    return {
      users,
      devices: cameras + akuvox + dnake,
      cameras,
      akuvox: akuvox + dnake,
      workShifts,
      activeAssignments,
      unassignedEmployees,
      todayAttendance,
      todayLate,
      todayEvents,
      todayInvalidEvents,
      contractors,
      projects,
      staffByContractor,
      todayCheckIns,
      todayCheckOuts,
      todayOnTime,
      todayEarly,
    };
  }

  /** Home dashboard: overview + zone stats + traffic by date range. */
  async homeDashboard(
    projectIds?: string[],
    params?: { from?: string; to?: string },
  ): Promise<HomeDashboard> {
    const overview = await this.overview();

    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const defaultFrom = new Date(todayLocal);
    defaultFrom.setDate(defaultFrom.getDate() - 6);

    let rangeStart = parseLocalDateOnly(params?.from ?? '') ?? defaultFrom;
    let rangeEnd = parseLocalDateOnly(params?.to ?? '') ?? todayLocal;
    if (rangeStart > rangeEnd) {
      const tmp = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = tmp;
    }

    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setHours(0, 0, 0, 0);
    const rangeEndExclusive = new Date(rangeEnd);
    rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);

    const fromKey = formatLocalDateKey(rangeStart);
    const toKey = formatLocalDateKey(rangeEnd);

    const logProjectFilter =
      projectIds !== undefined
        ? {
            projectId:
              projectIds.length === 0 ? { in: [] as string[] } : { in: projectIds },
          }
        : {};

    const zoneRows = await this.prisma.accessZone.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, parentZoneId: true },
      orderBy: { name: 'asc' },
    });
    const zoneIds = zoneRows.map((z) => z.id);

    const emptyZones: HomeZoneStat[] = zoneRows.map((z) => ({
      id: z.id,
      name: z.name,
      parentZoneId: z.parentZoneId,
      presentCount: 0,
      deviceTotal: 0,
      devicesOnline: 0,
      todayEvents: 0,
      todayInvalid: 0,
    }));

    if (zoneIds.length === 0) {
      return {
        from: fromKey,
        to: toKey,
        overview,
        zones: emptyZones,
        traffic7d: this.buildTrafficByDay(rangeStart, rangeEnd, []),
        periodSummary: { checkIns: 0, checkOuts: 0, invalidEvents: 0 },
      };
    }

    const presenceWhere =
      projectIds !== undefined
        ? {
            currentZoneId: { in: zoneIds },
            user: {
              projectId:
                projectIds.length === 0 ? { in: [] as string[] } : { in: projectIds },
            },
          }
        : { currentZoneId: { in: zoneIds } };

    const [
      presenceGroups,
      deviceGroups,
      deviceOnlineGroups,
      eventGroups,
      invalidGroups,
      trafficLogs,
      periodCheckIns,
      periodCheckOuts,
      periodInvalidEvents,
    ] = await Promise.all([
      this.prisma.userPresence.groupBy({
        by: ['currentZoneId'],
        where: presenceWhere,
        _count: { _all: true },
      }),
      this.prisma.device.groupBy({
        by: ['zoneId'],
        where: { isDeleted: false, zoneId: { in: zoneIds } },
        _count: { _all: true },
      }),
      this.prisma.device.groupBy({
        by: ['zoneId'],
        where: { isDeleted: false, zoneId: { in: zoneIds }, isOnline: true },
        _count: { _all: true },
      }),
      this.prisma.accessLog.groupBy({
        by: ['zoneId'],
        where: {
          zoneId: { in: zoneIds },
          eventAt: { gte: rangeStart, lt: rangeEndExclusive },
          ...logProjectFilter,
        },
        _count: { _all: true },
      }),
      this.prisma.accessLog.groupBy({
        by: ['zoneId'],
        where: {
          zoneId: { in: zoneIds },
          eventAt: { gte: rangeStart, lt: rangeEndExclusive },
          isValid: false,
          ...logProjectFilter,
        },
        _count: { _all: true },
      }),
      this.prisma.accessLog.findMany({
        where: {
          eventAt: { gte: rangeStart, lt: rangeEndExclusive },
          action: { in: ['CHECK_IN', 'CHECK_OUT'] },
          ...logProjectFilter,
        },
        select: { eventAt: true, action: true },
      }),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: rangeStart, lt: rangeEndExclusive },
          action: 'CHECK_IN',
          ...logProjectFilter,
        },
      }),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: rangeStart, lt: rangeEndExclusive },
          action: 'CHECK_OUT',
          ...logProjectFilter,
        },
      }),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: rangeStart, lt: rangeEndExclusive },
          isValid: false,
          ...logProjectFilter,
        },
      }),
    ]);

    const presentMap = new Map(
      presenceGroups
        .filter((g) => g.currentZoneId)
        .map((g) => [g.currentZoneId!, g._count._all]),
    );
    const deviceMap = new Map(
      deviceGroups.filter((g) => g.zoneId).map((g) => [g.zoneId!, g._count._all]),
    );
    const onlineMap = new Map(
      deviceOnlineGroups.filter((g) => g.zoneId).map((g) => [g.zoneId!, g._count._all]),
    );
    const eventsMap = new Map(
      eventGroups.filter((g) => g.zoneId).map((g) => [g.zoneId!, g._count._all]),
    );
    const invalidMap = new Map(
      invalidGroups.filter((g) => g.zoneId).map((g) => [g.zoneId!, g._count._all]),
    );

    const zones: HomeZoneStat[] = zoneRows.map((z) => ({
      id: z.id,
      name: z.name,
      parentZoneId: z.parentZoneId,
      presentCount: presentMap.get(z.id) ?? 0,
      deviceTotal: deviceMap.get(z.id) ?? 0,
      devicesOnline: onlineMap.get(z.id) ?? 0,
      todayEvents: eventsMap.get(z.id) ?? 0,
      todayInvalid: invalidMap.get(z.id) ?? 0,
    }));

    return {
      from: fromKey,
      to: toKey,
      overview,
      zones,
      traffic7d: this.buildTrafficByDay(rangeStart, rangeEnd, trafficLogs),
      periodSummary: {
        checkIns: periodCheckIns,
        checkOuts: periodCheckOuts,
        invalidEvents: periodInvalidEvents,
      },
    };
  }

  private buildTrafficByDay(
    start: Date,
    endInclusive: Date,
    logs: Array<{ eventAt: Date; action: string }>,
  ): Array<{ date: string; checkIns: number; checkOuts: number }> {
    const dayMap = new Map<string, { checkIns: number; checkOuts: number }>();
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(endInclusive);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      dayMap.set(formatLocalDateKey(cursor), { checkIns: 0, checkOuts: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const log of logs) {
      const local = log.eventAt;
      const key = formatLocalDateKey(local);
      const bucket = dayMap.get(key);
      if (!bucket) continue;
      if (log.action === 'CHECK_IN') bucket.checkIns += 1;
      else if (log.action === 'CHECK_OUT') bucket.checkOuts += 1;
    }
    return Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));
  }

  private buildTraffic7d(
    start: Date,
    logs: Array<{ eventAt: Date; action: string }>,
  ): Array<{ date: string; checkIns: number; checkOuts: number }> {
    const dayMap = new Map<string, { checkIns: number; checkOuts: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dayMap.set(key, { checkIns: 0, checkOuts: 0 });
    }
    for (const log of logs) {
      const local = log.eventAt;
      const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
      const bucket = dayMap.get(key);
      if (!bucket) continue;
      if (log.action === 'CHECK_IN') bucket.checkIns += 1;
      else if (log.action === 'CHECK_OUT') bucket.checkOuts += 1;
    }
    return Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));
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
    const withLocation = await attachPunchLocations(this.prisma, records);
    const rows: WeeklyRow[] = withLocation.map((r) => {
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
        zoneName: r.punchLocation?.zoneName ?? null,
        deviceName: r.punchLocation?.deviceName ?? null,
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

  /**
   * Dashboard thống kê: KPI + series theo ngày + breakdown theo NT/DA/NV.
   * Dùng late/OT đã lưu trên AttendanceRecord; AccessLog cho check-in/out.
   */
  async analytics(params: {
    from: string;
    to: string;
    projectId?: string;
    projectIds?: string[];
    contractorId?: string;
    userId?: string;
  }) {
    const now = new Date();
    const from = parseDateOnly(params.from, now);
    const toBase = parseDateOnly(params.to, now);
    const toExclusive = new Date(toBase);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const userFilter: Record<string, unknown> = {
      isDeleted: false,
    };
    if (params.userId) userFilter.id = params.userId;
    if (params.contractorId) userFilter.contractorId = params.contractorId;
    if (params.projectId) {
      userFilter.projectId = params.projectId;
    } else if (params.projectIds !== undefined) {
      userFilter.projectId = { in: params.projectIds };
    }

    const [staffCount, attendance, logs] = await Promise.all([
      this.prisma.user.count({ where: userFilter }),
      this.prisma.attendanceRecord.findMany({
        where: {
          date: { gte: from, lt: toExclusive },
          workShiftId: { not: null },
          user: userFilter,
        },
        include: {
          user: {
            include: { contractor: true, project: true },
          },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.accessLog.findMany({
        where: {
          eventAt: { gte: from, lt: toExclusive },
          isValid: true,
          user: userFilter,
        },
        select: {
          eventAt: true,
          action: true,
          userId: true,
          user: {
            select: {
              id: true,
              fullName: true,
              employeeCode: true,
              contractorId: true,
              projectId: true,
              contractor: { select: { id: true, name: true } },
              project: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const dayMap = new Map<
      string,
      { present: number; late: number; otMinutes: number; checkIns: number; checkOuts: number }
    >();
    const cursor = new Date(from);
    while (cursor < toExclusive) {
      dayMap.set(formatDateOnly(cursor), {
        present: 0,
        late: 0,
        otMinutes: 0,
        checkIns: 0,
        checkOuts: 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    let presentDays = 0;
    let lateCount = 0;
    let otMinutes = 0;
    let workedMinutes = 0;

    type BreakKey = string;
    const breakMap = new Map<BreakKey, { id: string; label: string; presentDays: number; lateCount: number; otMinutes: number }>();

    const breakMode: 'contractor' | 'project' | 'user' | 'none' = params.userId
      ? 'none'
      : params.contractorId && params.projectId
        ? 'user'
        : params.contractorId
          ? 'project'
          : 'contractor';

    function bumpBreak(
      id: string | null | undefined,
      label: string | null | undefined,
      patch: { present?: boolean; late?: boolean; ot?: number },
    ) {
      if (breakMode === 'none' || !id) return;
      const key = id;
      let row = breakMap.get(key);
      if (!row) {
        row = { id, label: label || id, presentDays: 0, lateCount: 0, otMinutes: 0 };
        breakMap.set(key, row);
      }
      if (patch.present) row.presentDays += 1;
      if (patch.late) row.lateCount += 1;
      if (patch.ot) row.otMinutes += patch.ot;
    }

    for (const r of attendance) {
      const dayKey = formatDateOnly(r.date);
      const bucket = dayMap.get(dayKey);
      const isPresent = !!r.checkInAt;
      const isLate = (r.lateMinutes ?? 0) > 0;
      const ot = r.otMinutes ?? 0;
      let worked = 0;
      if (r.checkInAt && r.checkOutAt) {
        worked = Math.max(
          0,
          Math.round((r.checkOutAt.getTime() - r.checkInAt.getTime()) / 60_000),
        );
        worked = Math.min(worked, 24 * 60);
      }

      if (isPresent) presentDays += 1;
      if (isLate) lateCount += 1;
      otMinutes += ot;
      workedMinutes += worked;

      if (bucket) {
        if (isPresent) bucket.present += 1;
        if (isLate) bucket.late += 1;
        bucket.otMinutes += ot;
      }

      if (breakMode === 'contractor') {
        bumpBreak(r.user?.contractorId, r.user?.contractor?.name, {
          present: isPresent,
          late: isLate,
          ot,
        });
      } else if (breakMode === 'project') {
        bumpBreak(r.user?.projectId, r.user?.project?.name, {
          present: isPresent,
          late: isLate,
          ot,
        });
      } else if (breakMode === 'user') {
        bumpBreak(r.userId, r.user?.fullName ?? r.user?.employeeCode, {
          present: isPresent,
          late: isLate,
          ot,
        });
      }
    }

    let checkInCount = 0;
    let checkOutCount = 0;
    for (const log of logs) {
      const dayKey = formatDateOnly(
        new Date(Date.UTC(log.eventAt.getFullYear(), log.eventAt.getMonth(), log.eventAt.getDate())),
      );
      // eventAt is local-ish Date from DB; use VN-safe via UTC parts of the instant's local date
      const local = log.eventAt;
      const localKey = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
      const bucket = dayMap.get(localKey) ?? dayMap.get(dayKey);
      if (log.action === 'CHECK_IN') {
        checkInCount += 1;
        if (bucket) bucket.checkIns += 1;
      } else if (log.action === 'CHECK_OUT') {
        checkOutCount += 1;
        if (bucket) bucket.checkOuts += 1;
      }
    }

    const byDay = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));
    const breakdown = Array.from(breakMap.values())
      .map((b) => ({
        id: b.id,
        label: b.label,
        value: b.presentDays,
        lateCount: b.lateCount,
        otMinutes: b.otMinutes,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      from: formatDateOnly(from),
      to: formatDateOnly(toBase),
      breakMode,
      summary: {
        staffCount,
        presentDays,
        lateCount,
        otMinutes,
        workedMinutes,
        checkInCount,
        checkOutCount,
      },
      byDay,
      breakdown,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCalculationService } from '../attendance/attendance-calculation.service';
import { attachPunchLocations } from '../attendance/punch-location.util';
import { StorageService } from '../storage/storage.service';
import {
  buildUserSearchSql,
  workedMinutesSql,
  type AttendanceUserScope,
} from './stats-attendance.util';

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
  timesheetTotal: number;
  timesheetPage: number;
  timesheetPageSize: number;
  timesheetTotalPages: number;
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
  /** Live panel snapshot at check-in (browser URL). */
  checkInSnapshotUrl: string | null;
  /** Live panel snapshot at check-out (browser URL). */
  checkOutSnapshotUrl: string | null;
}

export interface WeeklyTimesheet {
  weekStart: string;
  weekEnd: string;
  rows: WeeklyRow[];
  totalUsers: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type TimesheetListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: 'name' | 'least' | 'most';
  hasLate?: boolean;
  hasEarlyArrival?: boolean;
  hasOt?: boolean;
};

type WeeklyListParams = TimesheetListParams & {
  status?: string;
};

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
    private readonly storage: StorageService,
  ) {}

  private resolveSnapshotUrl(path: string | null | undefined): string | null {
    if (!path?.trim()) return null;
    const normalized = path.replace(/\\/g, '/');
    if (normalized.startsWith('snapshots/') || normalized.startsWith('face-images/')) {
      return this.storage.getBrowserFileUrl(normalized);
    }
    return null;
  }

  private userScopeSql(scope: AttendanceUserScope): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (scope.departmentId) {
      parts.push(Prisma.sql`AND u."departmentId" = ${scope.departmentId}`);
    }
    if (scope.contractorId) {
      parts.push(Prisma.sql`AND u."contractorId" = ${scope.contractorId}`);
    }
    if (scope.projectId) {
      parts.push(Prisma.sql`AND u."projectId" = ${scope.projectId}`);
    }
    if (parts.length === 0) return Prisma.empty;
    return Prisma.join(parts, ' ');
  }

  private triFlagSql(
    column: 'has_late' | 'has_ot',
    value: boolean | undefined,
  ): Prisma.Sql {
    if (value === true) {
      return column === 'has_late'
        ? Prisma.sql`AND uf.has_late = true`
        : Prisma.sql`AND uf.has_ot = true`;
    }
    if (value === false) {
      return column === 'has_late'
        ? Prisma.sql`AND uf.has_late = false`
        : Prisma.sql`AND uf.has_ot = false`;
    }
    return Prisma.empty;
  }

  private timesheetOrderSql(sort: 'name' | 'least' | 'most' = 'name'): Prisma.Sql {
    if (sort === 'least') {
      return Prisma.sql`ORDER BY worked_minutes ASC, full_name ASC`;
    }
    if (sort === 'most') {
      return Prisma.sql`ORDER BY worked_minutes DESC, full_name ASC`;
    }
    return Prisma.sql`ORDER BY full_name ASC`;
  }

  private async countAttendanceUsers(
    from: Date,
    toExclusive: Date,
    scope: AttendanceUserScope,
    search?: string,
    flags?: {
      hasLate?: boolean;
      hasOt?: boolean;
      status?: string;
    },
  ): Promise<number> {
    const worked = workedMinutesSql('ar');
  const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        WITH scoped AS (
          SELECT
            ar."userId",
            u."fullName" AS full_name,
            ar."lateMinutes",
            ar."otMinutes",
            ar.status,
            ${worked} AS worked_minutes
          FROM attendance_records ar
          INNER JOIN users u ON u.id = ar."userId"
          WHERE ar."workShiftId" IS NOT NULL
            AND ar.date >= ${from}
            AND ar.date < ${toExclusive}
            AND u."isDeleted" = false
            ${this.userScopeSql(scope)}
            ${buildUserSearchSql(search)}
        ),
        user_flags AS (
          SELECT
            "userId",
            MAX(full_name) AS full_name,
            BOOL_OR("lateMinutes" > 0 OR status = 'LATE') AS has_late,
            BOOL_OR("otMinutes" > 0 OR status = 'OVERTIME') AS has_ot,
            COALESCE(SUM(worked_minutes), 0)::int AS worked_minutes
          FROM scoped
          GROUP BY "userId"
        )
        SELECT COUNT(*)::int AS count
        FROM user_flags uf
        WHERE 1 = 1
          ${flags?.status ? Prisma.sql`AND EXISTS (
            SELECT 1 FROM scoped s
            WHERE s."userId" = uf."userId" AND s.status = ${flags.status}
          )` : Prisma.empty}
          ${this.triFlagSql('has_late', flags?.hasLate)}
          ${this.triFlagSql('has_ot', flags?.hasOt)}
      `,
    );
    return rows[0]?.count ?? 0;
  }

  private async listAttendanceUserIds(
    from: Date,
    toExclusive: Date,
    scope: AttendanceUserScope,
    list: TimesheetListParams & { status?: string },
  ): Promise<{ userIds: string[]; totalUsers: number }> {
    const page = list.page ?? 1;
    const pageSize = list.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const worked = workedMinutesSql('ar');

    const totalUsers = await this.countAttendanceUsers(from, toExclusive, scope, list.search, {
      hasLate: list.hasLate,
      hasOt: list.hasOt,
      status: list.status,
    });

    if (totalUsers === 0) {
      return { userIds: [], totalUsers: 0 };
    }

    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>(
      Prisma.sql`
        WITH scoped AS (
          SELECT
            ar."userId",
            u."fullName" AS full_name,
            ar."lateMinutes",
            ar."otMinutes",
            ar.status,
            ${worked} AS worked_minutes
          FROM attendance_records ar
          INNER JOIN users u ON u.id = ar."userId"
          WHERE ar."workShiftId" IS NOT NULL
            AND ar.date >= ${from}
            AND ar.date < ${toExclusive}
            AND u."isDeleted" = false
            ${this.userScopeSql(scope)}
            ${buildUserSearchSql(list.search)}
        ),
        user_flags AS (
          SELECT
            "userId",
            MAX(full_name) AS full_name,
            BOOL_OR("lateMinutes" > 0 OR status = 'LATE') AS has_late,
            BOOL_OR("otMinutes" > 0 OR status = 'OVERTIME') AS has_ot,
            COALESCE(SUM(worked_minutes), 0)::int AS worked_minutes
          FROM scoped
          GROUP BY "userId"
        )
        SELECT uf."userId"
        FROM user_flags uf
        WHERE 1 = 1
          ${list.status ? Prisma.sql`AND EXISTS (
            SELECT 1 FROM scoped s
            WHERE s."userId" = uf."userId" AND s.status = ${list.status}
          )` : Prisma.empty}
          ${this.triFlagSql('has_late', list.hasLate)}
          ${this.triFlagSql('has_ot', list.hasOt)}
        ${this.timesheetOrderSql(list.sort)}
        LIMIT ${pageSize} OFFSET ${skip}
      `,
    );

    return { userIds: rows.map((r) => r.userId), totalUsers };
  }

  private async computeEarlyArrivalCounts(
    userIds: string[],
    from: Date,
    toExclusive: Date,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        userId: { in: userIds },
        workShiftId: { not: null },
        date: { gte: from, lt: toExclusive },
        checkInAt: { not: null },
      },
      select: {
        userId: true,
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
    });

    const policy = await this.calc.getPolicyOptions();
    const out = new Map<string, number>();
    for (const r of records) {
      if (!r.workShift || !r.checkInAt) continue;
      const effective = this.calc.applyLateGraceFloor(r.workShift, policy.lateGraceFloor);
      if (this.calc.computeEarlyArrivalMinutes(r.checkInAt, effective) > 0) {
        out.set(r.userId, (out.get(r.userId) ?? 0) + 1);
      }
    }
    return out;
  }

  private filterUserIdsByEarlyArrival(
    userIds: string[],
    earlyCounts: Map<string, number>,
    hasEarlyArrival?: boolean,
  ): string[] {
    if (hasEarlyArrival === undefined) return userIds;
    return userIds.filter((id) => {
      const count = earlyCounts.get(id) ?? 0;
      return hasEarlyArrival ? count > 0 : count === 0;
    });
  }

  private async aggregateAttendanceSummary(
    from: Date,
    toExclusive: Date,
    scope: AttendanceUserScope,
  ): Promise<AttendanceSummaryTotals> {
    const worked = workedMinutesSql('ar');
    const rows = await this.prisma.$queryRaw<
      Array<{
        total_records: number;
        staff_count: number;
        present_count: number;
        late_count: number;
        early_leave_count: number;
        absent_count: number;
        ot_minutes: number;
        worked_minutes: number;
      }>
    >(
      Prisma.sql`
        SELECT
          COUNT(*)::int AS total_records,
          COUNT(DISTINCT ar."userId")::int AS staff_count,
          COUNT(*) FILTER (
            WHERE ar."checkInAt" IS NOT NULL AND ar.status <> 'ABSENT'
          )::int AS present_count,
          COUNT(*) FILTER (
            WHERE ar."lateMinutes" > 0 OR ar.status = 'LATE'
          )::int AS late_count,
          COUNT(*) FILTER (
            WHERE ar."earlyLeaveMinutes" > 0 OR ar.status = 'EARLY_LEAVE'
          )::int AS early_leave_count,
          COUNT(*) FILTER (WHERE ar.status = 'ABSENT')::int AS absent_count,
          COALESCE(SUM(ar."otMinutes"), 0)::int AS ot_minutes,
          COALESCE(SUM(${worked}), 0)::int AS worked_minutes
        FROM attendance_records ar
        INNER JOIN users u ON u.id = ar."userId"
        WHERE ar."workShiftId" IS NOT NULL
          AND ar.date >= ${from}
          AND ar.date < ${toExclusive}
          AND u."isDeleted" = false
          ${this.userScopeSql(scope)}
      `,
    );

    const row = rows[0];
    return {
      totalRecords: row?.total_records ?? 0,
      staffCount: row?.staff_count ?? 0,
      presentCount: row?.present_count ?? 0,
      lateCount: row?.late_count ?? 0,
      earlyLeaveCount: row?.early_leave_count ?? 0,
      absentCount: row?.absent_count ?? 0,
      otMinutes: row?.ot_minutes ?? 0,
      workedMinutes: row?.worked_minutes ?? 0,
    };
  }

  private async aggregateTimesheetPage(
    from: Date,
    toExclusive: Date,
    scope: AttendanceUserScope,
    list: TimesheetListParams,
  ): Promise<{ rows: TimesheetRow[]; total: number }> {
    const page = list.page ?? 1;
    const pageSize = list.pageSize ?? 10;

    let { userIds, totalUsers } = await this.listAttendanceUserIds(from, toExclusive, scope, list);

    const earlyCounts = await this.computeEarlyArrivalCounts(userIds, from, toExclusive);
    userIds = this.filterUserIdsByEarlyArrival(userIds, earlyCounts, list.hasEarlyArrival);

    if (list.hasEarlyArrival !== undefined && userIds.length < pageSize) {
      totalUsers = await this.countAttendanceUsers(from, toExclusive, scope, list.search, {
        hasLate: list.hasLate,
        hasOt: list.hasOt,
      });
      const filteredTotal = [...earlyCounts.entries()].filter(([id, count]) => {
        if (list.hasEarlyArrival) return count > 0;
        return count === 0;
      }).length;
      totalUsers = Math.min(totalUsers, filteredTotal);
    }

    if (userIds.length === 0) {
      return { rows: [], total: totalUsers };
    }

    const worked = workedMinutesSql('ar');
    const aggRows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        full_name: string;
        employee_code: string;
        department_name: string | null;
        days_worked: number;
        worked_minutes: number;
        late_count: number;
        early_count: number;
        ot_minutes: number;
      }>
    >(
      Prisma.sql`
        SELECT
          ar."userId",
          u."fullName" AS full_name,
          u."employeeCode" AS employee_code,
          d.name AS department_name,
          COUNT(*) FILTER (
            WHERE ar."checkInAt" IS NOT NULL AND ar.status <> 'ABSENT'
          )::int AS days_worked,
          COALESCE(SUM(${worked}), 0)::int AS worked_minutes,
          COUNT(*) FILTER (
            WHERE ar."lateMinutes" > 0 OR ar.status = 'LATE'
          )::int AS late_count,
          COUNT(*) FILTER (
            WHERE ar."earlyLeaveMinutes" > 0 OR ar.status = 'EARLY_LEAVE'
          )::int AS early_count,
          COALESCE(SUM(ar."otMinutes"), 0)::int AS ot_minutes
        FROM attendance_records ar
        INNER JOIN users u ON u.id = ar."userId"
        LEFT JOIN departments d ON d.id = u."departmentId"
        WHERE ar."workShiftId" IS NOT NULL
          AND ar.date >= ${from}
          AND ar.date < ${toExclusive}
          AND ar."userId" IN (${Prisma.join(userIds)})
        GROUP BY ar."userId", u."fullName", u."employeeCode", d.name
      `,
    );

    const orderIndex = new Map(userIds.map((id, i) => [id, i]));
    const rows: TimesheetRow[] = aggRows
      .sort((a, b) => (orderIndex.get(a.userId) ?? 0) - (orderIndex.get(b.userId) ?? 0))
      .map((r) => ({
        userId: r.userId,
        fullName: r.full_name,
        employeeCode: r.employee_code,
        departmentName: r.department_name,
        daysWorked: r.days_worked,
        workedMinutes: r.worked_minutes,
        lateCount: r.late_count,
        earlyArrivalCount: earlyCounts.get(r.userId) ?? 0,
        earlyCount: r.early_count,
        otMinutes: r.ot_minutes,
      }));

    return { rows, total: totalUsers };
  }

  async overview(projectIds?: string[]): Promise<StatsOverview> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const userScope =
      projectIds === undefined
        ? { isDeleted: false }
        : { isDeleted: false, projectId: { in: projectIds } };
    const contractorScope =
      projectIds === undefined
        ? { isDeleted: false }
        : {
            isDeleted: false,
            projectLinks: { some: { projectId: { in: projectIds } } },
          };
    const projectScope =
      projectIds === undefined
        ? { isDeleted: false }
        : { isDeleted: false, id: { in: projectIds } };
    const logScope =
      projectIds === undefined ? {} : { projectId: { in: projectIds } };
    const assignmentUserScope =
      projectIds === undefined ? {} : { user: { projectId: { in: projectIds } } };
    const attendanceUserScope =
      projectIds === undefined ? {} : { user: { projectId: { in: projectIds } } };

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
      this.prisma.user.count({ where: userScope }),
      // Device inventory is platform-wide — never expose totals to project-scoped accounts.
      projectIds === undefined
        ? this.prisma.device.count({ where: { isDeleted: false, deviceType: 'CAMERA' } })
        : Promise.resolve(0),
      projectIds === undefined
        ? this.prisma.device.count({ where: { isDeleted: false, deviceType: 'AKUVOX' } })
        : Promise.resolve(0),
      projectIds === undefined
        ? this.prisma.device.count({ where: { isDeleted: false, deviceType: 'DNAKE' } })
        : Promise.resolve(0),
      projectIds === undefined
        ? this.prisma.workShift.count({ where: { isDeleted: false } })
        : Promise.resolve(0),
      this.prisma.employeeShift.count({
        where: {
          isDeleted: false,
          OR: [{ endDate: null }, { endDate: { gte: startOfDay } }],
          ...assignmentUserScope,
        },
      }),
      // Match shifts UI isAssignmentActive: endDate null OR endDate > today (ended-on-today = not active).
      this.prisma.employeeShift.findMany({
        where: {
          isDeleted: false,
          startDate: { lte: startOfDay },
          OR: [{ endDate: null }, { endDate: { gt: startOfDay } }],
          ...assignmentUserScope,
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.attendanceRecord.count({
        where: {
          date: { gte: startOfDay, lt: endOfDay },
          workShiftId: { not: null },
          ...attendanceUserScope,
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          date: { gte: startOfDay, lt: endOfDay },
          workShiftId: { not: null },
          status: 'LATE',
          ...attendanceUserScope,
        },
      }),
      this.prisma.accessLog.count({
        where: { eventAt: { gte: startOfDay, lt: endOfDay }, ...logScope },
      }),
      this.prisma.accessLog.count({
        where: { eventAt: { gte: startOfDay, lt: endOfDay }, isValid: false, ...logScope },
      }),
      this.prisma.contractor.count({ where: contractorScope }),
      this.prisma.project.count({ where: projectScope }),
      this.prisma.user.groupBy({
        by: ['contractorId'],
        where: { ...userScope, contractorId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { contractorId: 'desc' } },
        take: 8,
      }),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: startOfDay, lt: endOfDay },
          action: 'CHECK_IN',
          ...logScope,
        },
      }),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: startOfDay, lt: endOfDay },
          action: 'CHECK_OUT',
          ...logScope,
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          date: { gte: startOfDay, lt: endOfDay },
          workShiftId: { not: null },
          checkInAt: { not: null },
          lateMinutes: 0,
          ...attendanceUserScope,
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          date: { gte: startOfDay, lt: endOfDay },
          workShiftId: { not: null },
          checkInAt: { not: null },
          ...attendanceUserScope,
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
    const overview = await this.overview(projectIds);

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
        traffic7d: this.buildTrafficFromSqlRows(rangeStart, rangeEnd, []),
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
      trafficDayRows,
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
      this.fetchTrafficCountsByDay(rangeStart, rangeEndExclusive, logProjectFilter),
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
      traffic7d: this.buildTrafficFromSqlRows(rangeStart, rangeEnd, trafficDayRows),
      periodSummary: {
        checkIns: periodCheckIns,
        checkOuts: periodCheckOuts,
        invalidEvents: periodInvalidEvents,
      },
    };
  }

  private analyticsUserSql(params: {
    userId?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
  }): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`AND u."isDeleted" = false`];
    if (params.userId) parts.push(Prisma.sql`AND u.id = ${params.userId}`);
    if (params.contractorId) parts.push(Prisma.sql`AND u."contractorId" = ${params.contractorId}`);
    if (params.projectId) {
      parts.push(Prisma.sql`AND u."projectId" = ${params.projectId}`);
    } else if (params.projectIds !== undefined) {
      if (params.projectIds.length === 0) {
        parts.push(Prisma.sql`AND 1 = 0`);
      } else {
        parts.push(Prisma.sql`AND u."projectId" IN (${Prisma.join(params.projectIds)})`);
      }
    }
    return Prisma.join(parts, ' ');
  }

  private buildTrafficFromSqlRows(
    start: Date,
    endInclusive: Date,
    rows: Array<{ date: string; check_ins: number; check_outs: number }>,
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
    for (const row of rows) {
      const bucket = dayMap.get(row.date);
      if (!bucket) continue;
      bucket.checkIns = row.check_ins;
      bucket.checkOuts = row.check_outs;
    }
    return Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));
  }

  private async fetchTrafficCountsByDay(
    from: Date,
    toExclusive: Date,
    logProjectFilter: Record<string, unknown>,
  ): Promise<Array<{ date: string; check_ins: number; check_outs: number }>> {
    const projectId = logProjectFilter.projectId;
    let projectSql = Prisma.empty;
    if (projectId && typeof projectId === 'object' && 'in' in projectId) {
      const ids = projectId.in as string[];
      projectSql =
        ids.length === 0
          ? Prisma.sql`AND 1 = 0`
          : Prisma.sql`AND al."projectId" IN (${Prisma.join(ids)})`;
    } else if (typeof projectId === 'string') {
      projectSql = Prisma.sql`AND al."projectId" = ${projectId}`;
    }

    return this.prisma.$queryRaw<
      Array<{ date: string; check_ins: number; check_outs: number }>
    >(
      Prisma.sql`
        SELECT
          to_char(al."eventAt"::date, 'YYYY-MM-DD') AS date,
          COUNT(*) FILTER (WHERE al.action = 'CHECK_IN')::int AS check_ins,
          COUNT(*) FILTER (WHERE al.action = 'CHECK_OUT')::int AS check_outs
        FROM access_logs al
        WHERE al."eventAt" >= ${from}
          AND al."eventAt" < ${toExclusive}
          AND al.action IN ('CHECK_IN', 'CHECK_OUT')
          ${projectSql}
        GROUP BY 1
        ORDER BY 1
      `,
    );
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

  async attendanceSummary(
    params: {
      from?: string;
      to?: string;
      departmentId?: string;
      contractorId?: string;
      projectId?: string;
    } & TimesheetListParams,
  ): Promise<AttendanceSummary> {
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const from = parseDateOnly(params.from ?? '', defaultFrom);
    const toBase = parseDateOnly(params.to ?? '', now);
    const toExclusive = new Date(toBase);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const scope: AttendanceUserScope = {
      departmentId: params.departmentId,
      contractorId: params.contractorId,
      projectId: params.projectId,
    };

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;

    const [summary, timesheetPage] = await Promise.all([
      this.aggregateAttendanceSummary(from, toExclusive, scope),
      this.aggregateTimesheetPage(from, toExclusive, scope, params),
    ]);

    const totalPages = Math.max(1, Math.ceil(timesheetPage.total / pageSize));

    return {
      summary,
      timesheet: timesheetPage.rows,
      timesheetTotal: timesheetPage.total,
      timesheetPage: Math.min(page, totalPages),
      timesheetPageSize: pageSize,
      timesheetTotalPages: totalPages,
    };
  }

  private async buildWeeklyRows(
    rangeStart: Date,
    rangeEndExclusive: Date,
    scope: AttendanceUserScope,
    list: WeeklyListParams,
  ): Promise<{ rows: WeeklyRow[]; totalUsers: number; page: number; pageSize: number }> {
    const page = list.page ?? 1;
    const pageSize = list.pageSize ?? 10;

    let { userIds, totalUsers } = await this.listAttendanceUserIds(
      rangeStart,
      rangeEndExclusive,
      scope,
      list,
    );

    const earlyCounts = await this.computeEarlyArrivalCounts(
      userIds,
      rangeStart,
      rangeEndExclusive,
    );
    userIds = this.filterUserIdsByEarlyArrival(userIds, earlyCounts, list.hasEarlyArrival);

    if (userIds.length === 0) {
      return { rows: [], totalUsers, page, pageSize };
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        userId: { in: userIds },
        workShiftId: { not: null },
        date: { gte: rangeStart, lt: rangeEndExclusive },
      },
      include: {
        user: { include: { department: true } },
        workShift: true,
      },
      orderBy: [{ userId: 'asc' }, { date: 'asc' }],
    });

    const policy = await this.calc.getPolicyOptions();
    const asOf = new Date();
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
        checkInSnapshotUrl: this.resolveSnapshotUrl(r.checkInSnapshotPath),
        checkOutSnapshotUrl: this.resolveSnapshotUrl(r.checkOutSnapshotPath),
      };
    });

    rows.sort((a, b) => {
      const byName = a.fullName.localeCompare(b.fullName, 'vi');
      if (byName !== 0) return byName;
      return a.date.localeCompare(b.date);
    });

    return { rows, totalUsers, page, pageSize };
  }

  async weeklyTimesheet(
    params: {
      weekStart?: string;
      from?: string;
      to?: string;
      departmentId?: string;
      contractorId?: string;
      projectId?: string;
    } & WeeklyListParams,
  ): Promise<WeeklyTimesheet> {
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

    const scope: AttendanceUserScope = {
      departmentId: params.departmentId,
      contractorId: params.contractorId,
      projectId: params.projectId,
    };

    const built = await this.buildWeeklyRows(rangeStart, rangeEndExclusive, scope, params);
    const totalPages = Math.max(1, Math.ceil(built.totalUsers / built.pageSize));
    const rangeEndDisplay = new Date(rangeEndExclusive);
    rangeEndDisplay.setUTCDate(rangeEndDisplay.getUTCDate() - 1);

    return {
      weekStart: formatDateOnly(rangeStart),
      weekEnd: formatDateOnly(rangeEndDisplay),
      rows: built.rows,
      totalUsers: built.totalUsers,
      page: Math.min(built.page, totalPages),
      pageSize: built.pageSize,
      totalPages,
    };
  }

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

    const userSql = this.analyticsUserSql(params);
    const worked = workedMinutesSql('ar');

    const breakMode: 'contractor' | 'project' | 'user' | 'none' = params.userId
      ? 'none'
      : params.contractorId && params.projectId
        ? 'user'
        : params.contractorId
          ? 'project'
          : 'contractor';

    const [
      staffCount,
      attendanceTotals,
      attendanceByDay,
      logByDay,
      checkInCount,
      checkOutCount,
      breakdownRows,
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          isDeleted: false,
          ...(params.userId ? { id: params.userId } : {}),
          ...(params.contractorId ? { contractorId: params.contractorId } : {}),
          ...(params.projectId
            ? { projectId: params.projectId }
            : params.projectIds !== undefined
              ? { projectId: { in: params.projectIds } }
              : {}),
        },
      }),
      this.prisma.$queryRaw<
        Array<{
          present_days: number;
          late_count: number;
          ot_minutes: number;
          worked_minutes: number;
        }>
      >(
        Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE ar."checkInAt" IS NOT NULL)::int AS present_days,
            COUNT(*) FILTER (WHERE ar."lateMinutes" > 0)::int AS late_count,
            COALESCE(SUM(ar."otMinutes"), 0)::int AS ot_minutes,
            COALESCE(SUM(${worked}), 0)::int AS worked_minutes
          FROM attendance_records ar
          INNER JOIN users u ON u.id = ar."userId"
          WHERE ar."workShiftId" IS NOT NULL
            AND ar.date >= ${from}
            AND ar.date < ${toExclusive}
            ${userSql}
        `,
      ),
      this.prisma.$queryRaw<
        Array<{
          date: string;
          present: number;
          late: number;
          ot_minutes: number;
        }>
      >(
        Prisma.sql`
          SELECT
            to_char(ar.date, 'YYYY-MM-DD') AS date,
            COUNT(*) FILTER (WHERE ar."checkInAt" IS NOT NULL)::int AS present,
            COUNT(*) FILTER (WHERE ar."lateMinutes" > 0)::int AS late,
            COALESCE(SUM(ar."otMinutes"), 0)::int AS ot_minutes
          FROM attendance_records ar
          INNER JOIN users u ON u.id = ar."userId"
          WHERE ar."workShiftId" IS NOT NULL
            AND ar.date >= ${from}
            AND ar.date < ${toExclusive}
            ${userSql}
          GROUP BY ar.date
          ORDER BY ar.date
        `,
      ),
      this.prisma.$queryRaw<
        Array<{ date: string; check_ins: number; check_outs: number }>
      >(
        Prisma.sql`
          SELECT
            to_char(al."eventAt"::date, 'YYYY-MM-DD') AS date,
            COUNT(*) FILTER (WHERE al.action = 'CHECK_IN')::int AS check_ins,
            COUNT(*) FILTER (WHERE al.action = 'CHECK_OUT')::int AS check_outs
          FROM access_logs al
          INNER JOIN users u ON u.id = al."userId"
          WHERE al."eventAt" >= ${from}
            AND al."eventAt" < ${toExclusive}
            AND al."isValid" = true
            AND al.action IN ('CHECK_IN', 'CHECK_OUT')
            ${userSql}
          GROUP BY 1
        `,
      ),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: from, lt: toExclusive },
          isValid: true,
          action: 'CHECK_IN',
          user: {
            isDeleted: false,
            ...(params.userId ? { id: params.userId } : {}),
            ...(params.contractorId ? { contractorId: params.contractorId } : {}),
            ...(params.projectId
              ? { projectId: params.projectId }
              : params.projectIds !== undefined
                ? { projectId: { in: params.projectIds } }
                : {}),
          },
        },
      }),
      this.prisma.accessLog.count({
        where: {
          eventAt: { gte: from, lt: toExclusive },
          isValid: true,
          action: 'CHECK_OUT',
          user: {
            isDeleted: false,
            ...(params.userId ? { id: params.userId } : {}),
            ...(params.contractorId ? { contractorId: params.contractorId } : {}),
            ...(params.projectId
              ? { projectId: params.projectId }
              : params.projectIds !== undefined
                ? { projectId: { in: params.projectIds } }
                : {}),
          },
        },
      }),
      breakMode === 'contractor'
        ? this.prisma.$queryRaw<
            Array<{
              id: string;
              label: string;
              present_days: number;
              late_count: number;
              ot_minutes: number;
            }>
          >(
            Prisma.sql`
              SELECT
                c.id,
                c.name AS label,
                COUNT(*) FILTER (WHERE ar."checkInAt" IS NOT NULL)::int AS present_days,
                COUNT(*) FILTER (WHERE ar."lateMinutes" > 0)::int AS late_count,
                COALESCE(SUM(ar."otMinutes"), 0)::int AS ot_minutes
              FROM attendance_records ar
              INNER JOIN users u ON u.id = ar."userId"
              INNER JOIN contractors c ON c.id = u."contractorId"
              WHERE ar."workShiftId" IS NOT NULL
                AND ar.date >= ${from}
                AND ar.date < ${toExclusive}
                ${userSql}
              GROUP BY c.id, c.name
            `,
          )
        : breakMode === 'project'
          ? this.prisma.$queryRaw<
              Array<{
                id: string;
                label: string;
                present_days: number;
                late_count: number;
                ot_minutes: number;
              }>
            >(
              Prisma.sql`
                SELECT
                  p.id,
                  p.name AS label,
                  COUNT(*) FILTER (WHERE ar."checkInAt" IS NOT NULL)::int AS present_days,
                  COUNT(*) FILTER (WHERE ar."lateMinutes" > 0)::int AS late_count,
                  COALESCE(SUM(ar."otMinutes"), 0)::int AS ot_minutes
                FROM attendance_records ar
                INNER JOIN users u ON u.id = ar."userId"
                INNER JOIN projects p ON p.id = u."projectId"
                WHERE ar."workShiftId" IS NOT NULL
                  AND ar.date >= ${from}
                  AND ar.date < ${toExclusive}
                  ${userSql}
                GROUP BY p.id, p.name
              `,
            )
          : breakMode === 'user'
            ? this.prisma.$queryRaw<
                Array<{
                  id: string;
                  label: string;
                  present_days: number;
                  late_count: number;
                  ot_minutes: number;
                }>
              >(
                Prisma.sql`
                  SELECT
                    u.id,
                    u."fullName" AS label,
                    COUNT(*) FILTER (WHERE ar."checkInAt" IS NOT NULL)::int AS present_days,
                    COUNT(*) FILTER (WHERE ar."lateMinutes" > 0)::int AS late_count,
                    COALESCE(SUM(ar."otMinutes"), 0)::int AS ot_minutes
                  FROM attendance_records ar
                  INNER JOIN users u ON u.id = ar."userId"
                  WHERE ar."workShiftId" IS NOT NULL
                    AND ar.date >= ${from}
                    AND ar.date < ${toExclusive}
                    ${userSql}
                  GROUP BY u.id, u."fullName"
                `,
              )
            : Promise.resolve([]),
    ]);

    const totals = attendanceTotals[0];
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
    for (const row of attendanceByDay) {
      const bucket = dayMap.get(row.date);
      if (!bucket) continue;
      bucket.present = row.present;
      bucket.late = row.late;
      bucket.otMinutes = row.ot_minutes;
    }
    for (const row of logByDay) {
      const bucket = dayMap.get(row.date);
      if (!bucket) continue;
      bucket.checkIns = row.check_ins;
      bucket.checkOuts = row.check_outs;
    }

    const byDay = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));
    const breakdown = breakdownRows
      .map((b) => ({
        id: b.id,
        label: b.label,
        value: b.present_days,
        lateCount: b.late_count,
        otMinutes: b.ot_minutes,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      from: formatDateOnly(from),
      to: formatDateOnly(toBase),
      breakMode,
      summary: {
        staffCount,
        presentDays: totals?.present_days ?? 0,
        lateCount: totals?.late_count ?? 0,
        otMinutes: totals?.ot_minutes ?? 0,
        workedMinutes: totals?.worked_minutes ?? 0,
        checkInCount,
        checkOutCount,
      },
      byDay,
      breakdown,
    };
  }
}

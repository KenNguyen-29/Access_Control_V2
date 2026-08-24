import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SETTING_KEY } from '../system-settings/system-setting-keys';
import { formatLocalDateTime } from '../attendance/attendance-excel.util';
import { zonedPartsInVietnam } from '../../common/utils/vn-time.util';
import * as ExcelJS from 'exceljs';

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateOnly(value: string, fallback: Date): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return startOfLocalDay(fallback);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatVnTime(d: Date | null | undefined): string {
  if (!d) return '';
  const p = zonedPartsInVietnam(d);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function formatVnDt(d: Date | null | undefined): string {
  if (!d) return '';
  return formatLocalDateTime(d);
}

function parseMonth(month?: string): {
  year: number;
  month: number;
  from: Date;
  toExclusive: Date;
  days: number;
  label: string;
} {
  const now = new Date();
  let year = now.getFullYear();
  let monthNum = now.getMonth() + 1;
  const match = /^(\d{4})-(\d{2})$/.exec((month ?? '').trim());
  if (match) {
    year = Number(match[1]);
    monthNum = Number(match[2]);
  }
  const from = new Date(Date.UTC(year, monthNum - 1, 1));
  const toExclusive = new Date(Date.UTC(year, monthNum, 1));
  const days = new Date(year, monthNum, 0).getDate();
  return {
    year,
    month: monthNum,
    from,
    toExclusive,
    days,
    label: `${year}-${String(monthNum).padStart(2, '0')}`,
  };
}

@Injectable()
export class ContractorReportsService {
  private readonly logger = new Logger(ContractorReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly settings: SystemSettingsService,
  ) {}

  private projectUserFilter(projectId?: string, projectIds?: string[]) {
    if (projectId) return { projectId };
    if (projectIds !== undefined) {
      if (projectIds.length === 0) return { projectId: { in: [] as string[] } };
      return { projectId: { in: projectIds } };
    }
    return {};
  }

  /** When `page` is set, return skip/take meta; otherwise export/full mode (no slice). */
  private resolvePaging(params: { page?: number; pageSize?: number }) {
    if (params.page == null) return null;
    const page = Math.max(1, params.page);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private pageMeta(total: number, paging: { page: number; pageSize: number } | null) {
    if (!paging) return {};
    return {
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      totalPages: Math.ceil(total / paging.pageSize) || 1,
    };
  }

  async headcountByContractor(params: {
    date?: string;
    projectIds?: string[];
    page?: number;
    pageSize?: number;
  }) {
    const day = params.date ? parseDateOnly(params.date, new Date()) : startOfLocalDay();
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const projectFilter = this.projectUserFilter(undefined, params.projectIds);
    const paging = this.resolvePaging(params);

    const userBaseWhere = {
      isDeleted: false,
      contractorId: { not: null as string | null },
      ...projectFilter,
    };

    // 3 queries total — avoid per-contractor Promise.all (exhausts Prisma pool / hangs API).
    const [contractors, registeredGroups, presentLogs] = await Promise.all([
      this.prisma.contractor.findMany({
        where: {
          isDeleted: false,
          ...(params.projectIds !== undefined
            ? {
                projectLinks: {
                  some: {
                    projectId: {
                      in: params.projectIds.length === 0 ? ([] as string[]) : params.projectIds,
                    },
                  },
                },
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.user.groupBy({
        by: ['contractorId'],
        where: userBaseWhere,
        _count: { _all: true },
      }),
      this.prisma.accessLog.findMany({
        where: {
          eventAt: { gte: day, lt: next },
          isValid: true,
          userId: { not: null },
          user: userBaseWhere,
        },
        select: {
          userId: true,
          user: { select: { contractorId: true } },
        },
        distinct: ['userId'],
      }),
    ]);

    const registeredByContractor = new Map<string, number>();
    for (const g of registeredGroups) {
      if (g.contractorId) registeredByContractor.set(g.contractorId, g._count._all);
    }

    const presentByContractor = new Map<string, Set<string>>();
    for (const log of presentLogs) {
      const cid = log.user?.contractorId;
      if (!cid || !log.userId) continue;
      let set = presentByContractor.get(cid);
      if (!set) {
        set = new Set();
        presentByContractor.set(cid, set);
      }
      set.add(log.userId);
    }

    const allRows = contractors.map((c) => ({
      contractorId: c.id,
      code: c.code,
      name: c.name,
      registeredCount: registeredByContractor.get(c.id) ?? 0,
      presentCount: presentByContractor.get(c.id)?.size ?? 0,
      date: formatDateOnly(day),
    }));

    const filtered = allRows.filter((r) => r.registeredCount > 0 || r.presentCount > 0);
    const rows = paging
      ? filtered.slice(paging.skip, paging.skip + paging.pageSize)
      : filtered;

    return {
      date: formatDateOnly(day),
      rows,
      ...this.pageMeta(filtered.length, paging),
    };
  }

  async personnelDetail(params: {
    from?: string;
    to?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
    page?: number;
    pageSize?: number;
  }) {
    const now = new Date();
    const from = params.from ? parseDateOnly(params.from, now) : startOfLocalDay(now);
    const toBase = params.to ? parseDateOnly(params.to, now) : startOfLocalDay(now);
    const to = new Date(toBase);
    to.setDate(to.getDate() + 1);
    const paging = this.resolvePaging(params);

    const where = {
      isDeleted: false,
      ...(params.contractorId
        ? { contractorId: params.contractorId }
        : { contractorId: { not: null } }),
      ...this.projectUserFilter(params.projectId, params.projectIds),
    };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          contractor: true,
          project: true,
          department: true,
        },
        orderBy: [{ fullName: 'asc' }],
        ...(paging ? { skip: paging.skip, take: paging.pageSize } : {}),
      }),
    ]);

    const userIds = users.map((u) => u.id);
    const logs = userIds.length
      ? await this.prisma.accessLog.findMany({
          where: {
            userId: { in: userIds },
            eventAt: { gte: from, lt: to },
            isValid: true,
          },
          orderBy: { eventAt: 'asc' },
          select: {
            userId: true,
            eventAt: true,
            action: true,
          },
        })
      : [];

    const byUser = new Map<string, typeof logs>();
    for (const log of logs) {
      if (!log.userId) continue;
      const list = byUser.get(log.userId) ?? [];
      list.push(log);
      byUser.set(log.userId, list);
    }

    const rows = users.map((u) => {
      const userLogs = byUser.get(u.id) ?? [];
      const firstIn = userLogs.find((l) => l.action === 'CHECK_IN') ?? userLogs[0];
      const lastOut = [...userLogs].reverse().find((l) => l.action === 'CHECK_OUT') ?? null;
      return {
        userId: u.id,
        employeeCode: u.employeeCode,
        fullName: u.fullName,
        citizenId: u.citizenId,
        userType: u.userType,
        contractorName: u.contractor?.name ?? null,
        contractorCode: u.contractor?.code ?? null,
        projectName: u.project?.name ?? null,
        projectCode: u.project?.code ?? null,
        departmentName: u.department?.name ?? null,
        firstCheckInAt: firstIn?.eventAt ?? null,
        lastCheckOutAt: lastOut?.eventAt ?? null,
        eventCount: userLogs.length,
      };
    });

    return {
      from: formatDateOnly(from),
      to: formatDateOnly(toBase),
      rows,
      ...this.pageMeta(total, paging),
    };
  }

  async accessLogReport(params: {
    from?: string;
    to?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
    userId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const now = new Date();
    const from = params.from ? parseDateOnly(params.from, now) : startOfLocalDay(now);
    const toBase = params.to ? parseDateOnly(params.to, now) : startOfLocalDay(now);
    const to = new Date(toBase);
    to.setDate(to.getDate() + 1);
    const paging = this.resolvePaging(params);

    const where = {
      eventAt: { gte: from, lt: to },
      ...(params.userId ? { userId: params.userId } : {}),
      user: {
        isDeleted: false,
        ...(params.contractorId ? { contractorId: params.contractorId } : {}),
        ...this.projectUserFilter(params.projectId, params.projectIds),
      },
    };

    const [total, logs] = await Promise.all([
      this.prisma.accessLog.count({ where }),
      this.prisma.accessLog.findMany({
        where,
        include: {
          user: {
            include: { contractor: true, project: true, department: true },
          },
          device: true,
          zone: true,
        },
        orderBy: { eventAt: 'asc' },
        skip: paging?.skip,
        take: paging ? paging.pageSize : 50_000,
      }),
    ]);

    return {
      from: formatDateOnly(from),
      to: formatDateOnly(toBase),
      rows: logs.map((l) => ({
        id: l.id,
        eventAt: l.eventAt,
        action: l.action,
        isValid: l.isValid,
        employeeCode: l.user?.employeeCode ?? null,
        fullName: l.user?.fullName ?? null,
        citizenId: l.user?.citizenId ?? null,
        contractorName: l.user?.contractor?.name ?? null,
        projectName: l.user?.project?.name ?? null,
        departmentName: l.user?.department?.name ?? null,
        deviceName: l.device?.name ?? null,
        zoneName: l.zone?.name ?? null,
      })),
      ...this.pageMeta(total, paging),
    };
  }

  async shiftPersonnel(params: {
    contractorId?: string;
    workShiftId?: string;
    projectId?: string;
    projectIds?: string[];
    page?: number;
    pageSize?: number;
  }) {
    const today = startOfLocalDay();
    const paging = this.resolvePaging(params);
    const where = {
      isDeleted: false,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gt: today } }],
      ...(params.workShiftId ? { workShiftId: params.workShiftId } : {}),
      user: {
        isDeleted: false,
        ...(params.contractorId ? { contractorId: params.contractorId } : {}),
        ...this.projectUserFilter(params.projectId, params.projectIds),
      },
    };

    const [total, assignments] = await Promise.all([
      this.prisma.employeeShift.count({ where }),
      this.prisma.employeeShift.findMany({
        where,
        include: {
          user: { include: { contractor: true, project: true, department: true } },
          workShift: true,
        },
        orderBy: [{ workShift: { name: 'asc' } }, { user: { fullName: 'asc' } }],
        ...(paging ? { skip: paging.skip, take: paging.pageSize } : {}),
      }),
    ]);

    return {
      asOf: formatDateOnly(today),
      rows: assignments.map((a) => ({
        assignmentId: a.id,
        userId: a.userId,
        employeeCode: a.user.employeeCode,
        fullName: a.user.fullName,
        citizenId: a.user.citizenId,
        contractorName: a.user.contractor?.name ?? null,
        projectName: a.user.project?.name ?? null,
        departmentName: a.user.department?.name ?? null,
        workShiftId: a.workShiftId,
        shiftName: a.workShift.name,
        shiftCode: a.workShift.code,
        startTime: a.workShift.startTime,
        endTime: a.workShift.endTime,
        assignmentType: a.assignmentType,
        startDate: a.startDate,
        endDate: a.endDate,
      })),
      ...this.pageMeta(total, paging),
    };
  }

  async exportPersonnelExcel(params: {
    from?: string;
    to?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
  }): Promise<Buffer> {
    const data = await this.personnelDetail(params);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Nhan su nha thau');
    sheet.columns = [
      { header: 'Ma NV', key: 'employeeCode', width: 14 },
      { header: 'Ho ten', key: 'fullName', width: 24 },
      { header: 'CCCD', key: 'citizenId', width: 16 },
      { header: 'Nha thau', key: 'contractorName', width: 20 },
      { header: 'Du an', key: 'projectName', width: 20 },
      { header: 'Phong ban', key: 'departmentName', width: 16 },
      { header: 'Vao dau', key: 'firstCheckInAt', width: 20 },
      { header: 'Ra cuoi', key: 'lastCheckOutAt', width: 20 },
      { header: 'So su kien', key: 'eventCount', width: 12 },
    ];
    for (const r of data.rows) {
      sheet.addRow({
        ...r,
        firstCheckInAt: formatVnDt(r.firstCheckInAt),
        lastCheckOutAt: formatVnDt(r.lastCheckOutAt),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportAccessLogsExcel(params: {
    from?: string;
    to?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
    userId?: string;
  }): Promise<Buffer> {
    const data = await this.accessLogReport(params);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Vao ra');
    sheet.columns = [
      { header: 'Thoi gian', key: 'eventAt', width: 22 },
      { header: 'Hanh dong', key: 'action', width: 12 },
      { header: 'Ma NV', key: 'employeeCode', width: 14 },
      { header: 'Ho ten', key: 'fullName', width: 24 },
      { header: 'CCCD', key: 'citizenId', width: 16 },
      { header: 'Nha thau', key: 'contractorName', width: 18 },
      { header: 'Du an', key: 'projectName', width: 18 },
      { header: 'Thiet bi', key: 'deviceName', width: 16 },
      { header: 'Khu vuc', key: 'zoneName', width: 16 },
    ];
    for (const r of data.rows) {
      sheet.addRow({
        ...r,
        eventAt: formatVnDt(r.eventAt),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportShiftPersonnelExcel(params: {
    contractorId?: string;
    workShiftId?: string;
    projectId?: string;
    projectIds?: string[];
  }): Promise<Buffer> {
    const data = await this.shiftPersonnel(params);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Nhan su theo ca');
    sheet.columns = [
      { header: 'Ca', key: 'shiftName', width: 18 },
      { header: 'Ma ca', key: 'shiftCode', width: 12 },
      { header: 'Gio', key: 'hours', width: 14 },
      { header: 'Ma NV', key: 'employeeCode', width: 14 },
      { header: 'Ho ten', key: 'fullName', width: 24 },
      { header: 'CCCD', key: 'citizenId', width: 16 },
      { header: 'Nha thau', key: 'contractorName', width: 18 },
      { header: 'Du an', key: 'projectName', width: 18 },
    ];
    for (const r of data.rows) {
      sheet.addRow({
        ...r,
        hours: `${r.startTime}–${r.endTime}`,
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportHeadcountExcel(params: { date?: string; projectIds?: string[] }): Promise<Buffer> {
    const data = await this.headcountByContractor(params);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('So luong nha thau');
    sheet.columns = [
      { header: 'Ngay', key: 'date', width: 12 },
      { header: 'Ma nha thau', key: 'code', width: 14 },
      { header: 'Nha thau', key: 'name', width: 28 },
      { header: 'Dang ky', key: 'registeredCount', width: 12 },
      { header: 'Co mat', key: 'presentCount', width: 12 },
    ];
    for (const r of data.rows) {
      sheet.addRow(r);
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private contractorUserWhere(params: {
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
  }) {
    return {
      isDeleted: false,
      ...(params.contractorId
        ? { contractorId: params.contractorId }
        : { contractorId: { not: null } }),
      ...this.projectUserFilter(params.projectId, params.projectIds),
    };
  }

  async monthlyTimesheet(params: {
    month?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
    page?: number;
    pageSize?: number;
  }) {
    const range = parseMonth(params.month);
    const paging = this.resolvePaging(params);
    const where = this.contractorUserWhere(params);

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { contractor: true, project: true, department: true },
        orderBy: [{ fullName: 'asc' }],
        ...(paging ? { skip: paging.skip, take: paging.pageSize } : {}),
      }),
    ]);

    const userIds = users.map((u) => u.id);
    const records = userIds.length
      ? await this.prisma.attendanceRecord.findMany({
          where: {
            userId: { in: userIds },
            workShiftId: { not: null },
            date: { gte: range.from, lt: range.toExclusive },
          },
          include: { workShift: true },
        })
      : [];

    const byUser = new Map<string, typeof records>();
    for (const rec of records) {
      const list = byUser.get(rec.userId) ?? [];
      list.push(rec);
      byUser.set(rec.userId, list);
    }

    const rows = users.map((u) => {
      const list = byUser.get(u.id) ?? [];
      const present = list.filter((r) => r.checkInAt);
      return {
        userId: u.id,
        employeeCode: u.employeeCode,
        fullName: u.fullName,
        citizenId: u.citizenId,
        contractorName: u.contractor?.name ?? null,
        projectName: u.project?.name ?? null,
        departmentName: u.department?.name ?? null,
        workDays: present.length,
        lateDays: present.filter((r) => (r.lateMinutes ?? 0) > 0).length,
        lateMinutes: present.reduce((n, r) => n + (r.lateMinutes ?? 0), 0),
        earlyLeaveMinutes: present.reduce((n, r) => n + (r.earlyLeaveMinutes ?? 0), 0),
        otMinutes: present.reduce((n, r) => n + (r.otMinutes ?? 0), 0),
      };
    });

    return {
      month: range.label,
      days: range.days,
      rows,
      ...this.pageMeta(total, paging),
    };
  }

  async monthlyDailyDetail(params: {
    month?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
  }) {
    const range = parseMonth(params.month);
    const users = await this.prisma.user.findMany({
      where: this.contractorUserWhere(params),
      include: { contractor: true, project: true },
      orderBy: [{ fullName: 'asc' }],
    });
    const userIds = users.map((u) => u.id);
    const records = userIds.length
      ? await this.prisma.attendanceRecord.findMany({
          where: {
            userId: { in: userIds },
            workShiftId: { not: null },
            date: { gte: range.from, lt: range.toExclusive },
          },
        })
      : [];

    const byUserDay = new Map<string, Map<number, (typeof records)[number]>>();
    for (const rec of records) {
      const day = rec.date.getUTCDate();
      const map = byUserDay.get(rec.userId) ?? new Map();
      map.set(day, rec);
      byUserDay.set(rec.userId, map);
    }

    const rows = users.map((u) => {
      const days: Record<string, string> = {};
      const dayMap = byUserDay.get(u.id);
      for (let d = 1; d <= range.days; d += 1) {
        const rec = dayMap?.get(d);
        if (!rec?.checkInAt) {
          days[String(d)] = '';
          continue;
        }
        const inn = formatVnTime(rec.checkInAt);
        const out = formatVnTime(rec.checkOutAt);
        days[String(d)] = out ? `${inn}-${out}` : inn;
      }
      return {
        userId: u.id,
        employeeCode: u.employeeCode,
        fullName: u.fullName,
        citizenId: u.citizenId,
        contractorName: u.contractor?.name ?? null,
        projectName: u.project?.name ?? null,
        days,
      };
    });

    return { month: range.label, days: range.days, rows };
  }

  async exportMonthlyExcel(params: {
    month?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
  }): Promise<Buffer> {
    const data = await this.monthlyTimesheet(params);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(`Ngay cong ${data.month}`);
    sheet.columns = [
      { header: 'Ma NV', key: 'employeeCode', width: 14 },
      { header: 'Ho ten', key: 'fullName', width: 24 },
      { header: 'CCCD', key: 'citizenId', width: 16 },
      { header: 'Nha thau', key: 'contractorName', width: 20 },
      { header: 'Du an', key: 'projectName', width: 20 },
      { header: 'Ngay cong', key: 'workDays', width: 12 },
      { header: 'Ngay muon', key: 'lateDays', width: 12 },
      { header: 'Muon (phut)', key: 'lateMinutes', width: 14 },
      { header: 'Ve som (phut)', key: 'earlyLeaveMinutes', width: 14 },
      { header: 'OT (phut)', key: 'otMinutes', width: 12 },
    ];
    for (const r of data.rows) sheet.addRow(r);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportMonthlyDetailExcel(params: {
    month?: string;
    contractorId?: string;
    projectId?: string;
    projectIds?: string[];
  }): Promise<Buffer> {
    const data = await this.monthlyDailyDetail(params);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(`Chi tiet ${data.month}`);
    const dayCols = Array.from({ length: data.days }, (_, i) => ({
      header: String(i + 1),
      key: String(i + 1),
      width: 12,
    }));
    sheet.columns = [
      { header: 'Ma NV', key: 'employeeCode', width: 14 },
      { header: 'Ho ten', key: 'fullName', width: 24 },
      { header: 'CCCD', key: 'citizenId', width: 16 },
      { header: 'Nha thau', key: 'contractorName', width: 20 },
      { header: 'Du an', key: 'projectName', width: 18 },
      ...dayCols,
    ];
    for (const r of data.rows) {
      sheet.addRow({
        employeeCode: r.employeeCode,
        fullName: r.fullName,
        citizenId: r.citizenId,
        contractorName: r.contractorName,
        projectName: r.projectName,
        ...r.days,
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /** Build + persist daily headcount snapshots; optionally push to monitor URL. */
  async snapshotAndPush(dateInput?: string, push = true) {
    const day = dateInput ? parseDateOnly(dateInput, new Date()) : startOfLocalDay();
    const { rows } = await this.headcountByContractor({ date: formatDateOnly(day) });

    const saved = [];
    for (const row of rows) {
      const payload = {
        date: row.date,
        contractor: { id: row.contractorId, code: row.code, name: row.name },
        registeredCount: row.registeredCount,
        presentCount: row.presentCount,
      };
      const record = await this.prisma.dailyContractorHeadcount.upsert({
        where: {
          date_contractorId: { date: day, contractorId: row.contractorId },
        },
        create: {
          date: day,
          contractorId: row.contractorId,
          headcount: row.presentCount,
          payload,
        },
        update: {
          headcount: row.presentCount,
          payload,
        },
      });
      saved.push(record);
    }

    let pushResult: { ok: boolean; status?: string; error?: string } = {
      ok: false,
      status: 'SKIPPED',
    };
    if (push) {
      pushResult = await this.pushToMonitor({
        date: formatDateOnly(day),
        contractors: rows.map((r) => ({
          code: r.code,
          name: r.name,
          headcount: r.presentCount,
          registeredCount: r.registeredCount,
        })),
      });
      await this.prisma.dailyContractorHeadcount.updateMany({
        where: { date: day },
        data: {
          pushedAt: new Date(),
          pushStatus: pushResult.status ?? (pushResult.ok ? 'OK' : 'FAILED'),
          pushError: pushResult.error ?? null,
        },
      });
    }

    return { date: formatDateOnly(day), saved: saved.length, push: pushResult, rows };
  }

  @Cron('5 0 * * *')
  async cronDailyPush() {
    try {
      const enabled = await this.settings.getBoolean(SETTING_KEY.MONITOR_PUSH_ENABLED, false);
      if (!enabled) return;
      await this.snapshotAndPush(undefined, true);
    } catch (err) {
      this.logger.error(`Daily contractor push failed: ${(err as Error).message}`);
    }
  }

  private async pushToMonitor(body: unknown): Promise<{
    ok: boolean;
    status?: string;
    error?: string;
  }> {
    const url = (await this.settings.getRawOrDefault(SETTING_KEY.MONITOR_PUSH_URL, '')).trim();
    if (!url) {
      return { ok: false, status: 'NO_URL', error: 'Chưa cấu hình MONITOR_PUSH_URL' };
    }
    const secret = (await this.settings.getRawOrDefault(SETTING_KEY.MONITOR_PUSH_SECRET, '')).trim();
    try {
      const res = await firstValueFrom(
        this.http.post(url, body, {
          timeout: 15_000,
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
          },
        }),
      );
      const status = String(res.status);
      return { ok: res.status >= 200 && res.status < 300, status };
    } catch (err) {
      return {
        ok: false,
        status: 'FAILED',
        error: (err as Error).message,
      };
    }
  }

  listSnapshots(limit = 30) {
    return this.prisma.dailyContractorHeadcount.findMany({
      take: Math.min(100, Math.max(1, limit)),
      orderBy: [{ date: 'desc' }, { contractor: { name: 'asc' } }],
      include: { contractor: true, project: true },
    });
  }
}

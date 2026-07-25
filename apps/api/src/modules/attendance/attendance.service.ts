import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessAction, AttendanceRecord, AttendanceStatus, WorkShift } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SETTING_KEY } from '../system-settings/system-setting-keys';
import { AttendanceCalculationService } from './attendance-calculation.service';
import {
  ATTENDANCE_HEADER_ALIASES,
  cellToNumber,
  cellToString,
  createAttendanceWorkbook,
  formatLocalDate,
  formatLocalDateTime,
  normalizeHeader,
  parseLocalDateOnly,
  parseLocalDateTime,
  workbookToBuffer,
  type AttendanceExcelColumnKey,
} from './attendance-excel.util';

export type AttendanceImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export type PunchOutcome = 'CHECK_IN' | 'CHECK_OUT' | 'IGNORED';
export type PunchIgnoreReason = 'COOLDOWN' | 'ALREADY_COMPLETE';

export type PunchResult = {
  outcome: PunchOutcome;
  record: AttendanceRecord | null;
  reason?: PunchIgnoreReason;
  cooldownMinutes: number;
  message?: string;
};

const VALID_STATUSES = new Set<string>(Object.values(AttendanceStatus));

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly calc: AttendanceCalculationService,
    private readonly settings: SystemSettingsService,
  ) {}

  private async punchCooldownMinutes(): Promise<number> {
    const fromDb = await this.settings.getNumber(SETTING_KEY.PUNCH_COOLDOWN_MINUTES, NaN);
    if (Number.isFinite(fromDb)) return Math.max(0, fromDb);
    return Number(this.config.get<string>('PUNCH_COOLDOWN_MINUTES', '5'));
  }

  private utcDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  async resolveShiftForUser(userId: string, at: Date): Promise<WorkShift | null> {
    const day = this.calc.resolveWorkDateForPunch(null, at);
    const assignment = await this.prisma.employeeShift.findFirst({
      where: {
        userId,
        isDeleted: false,
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gte: day } }],
      },
      include: { workShift: true },
      orderBy: { startDate: 'desc' },
    });
    if (assignment?.workShift && !assignment.workShift.isDeleted) {
      return assignment.workShift;
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'default_work_shift_id' },
    });
    if (setting) {
      const shift = await this.prisma.workShift.findFirst({
        where: { id: setting.value, isDeleted: false },
      });
      if (shift) return shift;
    }

    return this.prisma.workShift.findFirst({
      where: { isDeleted: false, isDefault: true },
    });
  }

  async processPunch(userId: string, eventTime: Date): Promise<PunchResult> {
    const cooldownMinutes = await this.punchCooldownMinutes();
    const policy = await this.calc.getPolicyOptions();
    // Resolve shift using calendar day first, then overnight-aware work date.
    const provisionalShift = await this.resolveShiftForUser(userId, eventTime);
    const workDate = this.calc.resolveWorkDateForPunch(provisionalShift, eventTime);
    const shift =
      provisionalShift ??
      (await this.resolveShiftForUser(
        userId,
        new Date(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 12),
      ));
    const effectiveShift = shift
      ? this.calc.applyLateGraceFloor(shift, policy.lateGraceFloor)
      : null;
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId, date: workDate } },
    });

    if (!existing?.checkInAt) {
      const lateMinutes = effectiveShift
        ? this.calc.computeLateMinutes(effectiveShift, eventTime)
        : 0;

      const record = await this.prisma.attendanceRecord.upsert({
        where: { userId_date: { userId, date: workDate } },
        create: {
          userId,
          workShiftId: shift?.id,
          date: workDate,
          checkInAt: eventTime,
          lateMinutes,
          status: lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
        },
        update: {
          checkInAt: eventTime,
          workShiftId: shift?.id,
          lateMinutes,
          checkOutAt: null,
          earlyLeaveMinutes: 0,
          otMinutes: 0,
          status: lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
        },
      });

      return { outcome: 'CHECK_IN', record, cooldownMinutes };
    }

    if (existing.checkOutAt) {
      return {
        outcome: 'IGNORED',
        record: existing,
        reason: 'ALREADY_COMPLETE',
        cooldownMinutes,
        message: 'Đã chấm công xong hôm nay',
      };
    }

    const elapsedMs = eventTime.getTime() - existing.checkInAt.getTime();
    if (elapsedMs < cooldownMinutes * 60 * 1000) {
      return {
        outcome: 'IGNORED',
        record: existing,
        reason: 'COOLDOWN',
        cooldownMinutes,
        message: `Quét trong vòng ${cooldownMinutes} phút, chưa tính chấm công`,
      };
    }

    const { earlyLeaveMinutes, otMinutes } = effectiveShift
      ? this.calc.computeEarlyLeaveAndOt(effectiveShift, eventTime, {
          earlyLeaveGraceMinutes: policy.earlyLeaveGraceMinutes,
          otAfterMinutes: policy.otAfterMinutes,
        })
      : { earlyLeaveMinutes: 0, otMinutes: 0 };

    const lateMinutes = existing.lateMinutes ?? 0;
    const status = this.calc.computeStatus({
      lateMinutes,
      earlyLeaveMinutes,
      otMinutes,
      checkInAt: existing.checkInAt,
      checkOutAt: eventTime,
    });

    const record = await this.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        checkOutAt: eventTime,
        workShiftId: shift?.id ?? existing.workShiftId,
        earlyLeaveMinutes,
        otMinutes,
        status,
      },
    });

    return { outcome: 'CHECK_OUT', record, cooldownMinutes };
  }

  async findRecords(
    query: PaginationDto & {
      userId?: string;
      from?: string;
      to?: string;
      departmentId?: string;
      status?: AttendanceStatus;
      search?: string;
      hasLate?: boolean;
      hasEarlyLeave?: boolean;
      hasOt?: boolean;
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const userFilter =
      query.departmentId || search
        ? {
            user: {
              ...(query.departmentId ? { departmentId: query.departmentId } : {}),
              ...(search
                ? {
                    OR: [
                      { fullName: { contains: search, mode: 'insensitive' as const } },
                      { employeeCode: { contains: search, mode: 'insensitive' as const } },
                    ],
                  }
                : {}),
            },
          }
        : {};
    const where = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...userFilter,
      ...(query.hasLate === true ? { lateMinutes: { gt: 0 } } : {}),
      ...(query.hasLate === false ? { lateMinutes: { lte: 0 } } : {}),
      ...(query.hasEarlyLeave === true ? { earlyLeaveMinutes: { gt: 0 } } : {}),
      ...(query.hasEarlyLeave === false ? { earlyLeaveMinutes: { lte: 0 } } : {}),
      ...(query.hasOt === true ? { otMinutes: { gt: 0 } } : {}),
      ...(query.hasOt === false ? { otMinutes: { lte: 0 } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        include: {
          user: { include: { department: true } },
          workShift: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ checkInAt: 'desc' }, { date: 'desc' }],
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  findAccessLogs(query: {
    limit?: number;
    deviceId?: string;
    action?: AccessAction;
    isValid?: boolean;
    unknownOnly?: boolean;
  } = {}) {
    const limit = query.limit ?? 50;
    return this.prisma.accessLog.findMany({
      where: {
        ...(query.deviceId ? { deviceId: query.deviceId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.isValid !== undefined ? { isValid: query.isValid } : {}),
        ...(query.unknownOnly ? { userId: null } : {}),
      },
      take: limit,
      orderBy: { eventAt: 'desc' },
      include: {
        user: { include: { department: true } },
        device: true,
      },
    });
  }

  async findRecordsForExport(query: { userId?: string; from?: string; to?: string }) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: { user: true, workShift: true },
      orderBy: [{ date: 'asc' }, { userId: 'asc' }],
    });
  }

  async buildExportBuffer(query: { userId?: string; from?: string; to?: string }): Promise<Buffer> {
    const records = await this.findRecordsForExport(query);
    const { workbook, sheet } = createAttendanceWorkbook();

    for (const r of records) {
      sheet.addRow({
        employeeCode: r.user?.employeeCode ?? '',
        fullName: r.user?.fullName ?? '',
        date: formatLocalDate(r.date),
        shift: r.workShift?.name ?? '',
        checkIn: r.checkInAt ? formatLocalDateTime(r.checkInAt) : '',
        checkOut: r.checkOutAt ? formatLocalDateTime(r.checkOutAt) : '',
        status: r.status,
        late: r.lateMinutes,
        early: r.earlyLeaveMinutes,
        ot: r.otMinutes,
      });
    }

    return workbookToBuffer(workbook);
  }

  async buildTemplateBuffer(): Promise<Buffer> {
    const { workbook, sheet } = createAttendanceWorkbook();
    sheet.addRow({
      employeeCode: 'NV001',
      fullName: 'Nguyễn Văn A',
      date: formatLocalDate(new Date()),
      shift: 'Ca hành chính',
      checkIn: `${formatLocalDate(new Date())} 08:05`,
      checkOut: `${formatLocalDate(new Date())} 17:00`,
      status: 'LATE',
      late: 5,
      early: 0,
      ot: 0,
    });
    return workbookToBuffer(workbook);
  }

  private mapHeaderRow(headerRow: ExcelJS.Row): Partial<Record<AttendanceExcelColumnKey, number>> {
    const map: Partial<Record<AttendanceExcelColumnKey, number>> = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const normalized = normalizeHeader(cell.value);
      for (const [key, aliases] of Object.entries(ATTENDANCE_HEADER_ALIASES) as Array<
        [AttendanceExcelColumnKey, string[]]
      >) {
        if (aliases.includes(normalized)) {
          map[key] = colNumber;
          break;
        }
      }
    });
    return map;
  }

  private parseStatus(raw: string): AttendanceStatus | null {
    if (!raw) return null;
    const upper = raw.trim().toUpperCase().replace(/\s+/g, '_');
    if (VALID_STATUSES.has(upper)) return upper as AttendanceStatus;
    return null;
  }

  async importFromExcelBuffer(buffer: Buffer): Promise<AttendanceImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('File Excel không có sheet nào');
    }

    const headerMap = this.mapHeaderRow(sheet.getRow(1));
    if (!headerMap.employeeCode || !headerMap.date) {
      throw new BadRequestException('Thiếu cột bắt buộc "Mã NV" hoặc "Ngày" ở hàng tiêu đề');
    }

    const result: AttendanceImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const shiftCache = new Map<string, WorkShift | null>();

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const employeeCode = cellToString(row.getCell(headerMap.employeeCode!).value);
      const dateRaw = cellToString(row.getCell(headerMap.date!).value);

      // Skip completely empty rows
      if (!employeeCode && !dateRaw) {
        result.skipped += 1;
        continue;
      }

      if (!employeeCode) {
        result.errors.push({ row: rowNumber, message: 'Thiếu Mã NV' });
        continue;
      }
      if (!dateRaw) {
        result.errors.push({ row: rowNumber, message: 'Thiếu Ngày' });
        continue;
      }

      let workDate = parseLocalDateOnly(dateRaw.slice(0, 10));
      if (!workDate) {
        const asDt = parseLocalDateTime(row.getCell(headerMap.date!).value);
        if (asDt) workDate = this.utcDateOnly(asDt);
      }

      if (!workDate) {
        result.errors.push({ row: rowNumber, message: `Ngày không hợp lệ: ${dateRaw}` });
        continue;
      }

      // Persist date as UTC midnight for @db.Date consistency with processPunch
      workDate = this.utcDateOnly(workDate);

      const user = await this.prisma.user.findFirst({
        where: { employeeCode, isDeleted: false },
      });
      if (!user) {
        result.errors.push({ row: rowNumber, message: `Không tìm thấy nhân viên mã ${employeeCode}` });
        continue;
      }

      const shiftName = headerMap.shift ? cellToString(row.getCell(headerMap.shift).value) : '';
      let shift: WorkShift | null = null;
      if (shiftName) {
        if (shiftCache.has(shiftName)) {
          shift = shiftCache.get(shiftName) ?? null;
        } else {
          shift = await this.prisma.workShift.findFirst({
            where: { name: shiftName, isDeleted: false },
          });
          shiftCache.set(shiftName, shift);
        }
        if (!shift) {
          result.errors.push({
            row: rowNumber,
            message: `Không tìm thấy ca "${shiftName}" — dùng ca gán mặc định`,
          });
        }
      }
      if (!shift) {
        shift = await this.resolveShiftForUser(user.id, workDate);
      }

      const checkInAt = headerMap.checkIn
        ? parseLocalDateTime(row.getCell(headerMap.checkIn).value)
        : null;
      const checkOutAt = headerMap.checkOut
        ? parseLocalDateTime(row.getCell(headerMap.checkOut).value)
        : null;

      const lateFromFile = headerMap.late
        ? cellToNumber(row.getCell(headerMap.late).value)
        : null;
      const earlyFromFile = headerMap.early
        ? cellToNumber(row.getCell(headerMap.early).value)
        : null;
      const otFromFile = headerMap.ot ? cellToNumber(row.getCell(headerMap.ot).value) : null;

      const computed = this.calc.computeMetricsFromTimes(shift, checkInAt, checkOutAt, workDate);
      const lateMinutes = lateFromFile ?? computed.lateMinutes;
      const earlyLeaveMinutes = earlyFromFile ?? computed.earlyLeaveMinutes;
      const otMinutes = otFromFile ?? computed.otMinutes;

      const statusRaw = headerMap.status
        ? cellToString(row.getCell(headerMap.status).value)
        : '';
      const explicitStatus = this.parseStatus(statusRaw);
      if (statusRaw && !explicitStatus) {
        result.errors.push({
          row: rowNumber,
          message: `Trạng thái không hợp lệ "${statusRaw}" — dùng trạng thái tự suy ra`,
        });
      }

      const status = this.calc.computeStatus({
        lateMinutes,
        earlyLeaveMinutes,
        otMinutes,
        checkInAt,
        checkOutAt,
        explicit: explicitStatus,
      });

      const existing = await this.prisma.attendanceRecord.findUnique({
        where: { userId_date: { userId: user.id, date: workDate } },
      });

      const data = {
        workShiftId: shift?.id ?? existing?.workShiftId ?? null,
        checkInAt,
        checkOutAt,
        lateMinutes,
        earlyLeaveMinutes,
        otMinutes,
        status,
      };

      if (existing) {
        await this.prisma.attendanceRecord.update({
          where: { id: existing.id },
          data,
        });
        result.updated += 1;
      } else {
        await this.prisma.attendanceRecord.create({
          data: {
            userId: user.id,
            date: workDate,
            ...data,
          },
        });
        result.created += 1;
      }
    }

    return result;
  }
}

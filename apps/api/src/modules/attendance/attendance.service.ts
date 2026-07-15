import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceStatus, WorkShift } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
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

const VALID_STATUSES = new Set<string>(Object.values(AttendanceStatus));

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private workDateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  private timeToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  private eventToMinutes(eventTime: Date): number {
    return eventTime.getHours() * 60 + eventTime.getMinutes();
  }

  async resolveShiftForUser(userId: string, at: Date): Promise<WorkShift | null> {
    const day = this.workDateOnly(at);
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

  private computeStatus(params: {
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

  private computeMetricsFromTimes(
    shift: WorkShift | null,
    checkInAt: Date | null,
    checkOutAt: Date | null,
  ): { lateMinutes: number; earlyLeaveMinutes: number; otMinutes: number } {
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    let otMinutes = 0;
    if (!shift) return { lateMinutes, earlyLeaveMinutes, otMinutes };

    if (checkInAt) {
      const startMin = this.timeToMinutes(shift.startTime);
      const eventMin = this.eventToMinutes(checkInAt);
      lateMinutes = Math.max(0, eventMin - startMin);
    }

    if (checkOutAt) {
      let endMin = this.timeToMinutes(shift.endTime);
      let eventMin = this.eventToMinutes(checkOutAt);
      if (shift.isOvernight && eventMin < this.timeToMinutes(shift.startTime)) {
        eventMin += 24 * 60;
        endMin += 24 * 60;
      }
      if (eventMin < endMin) {
        earlyLeaveMinutes = endMin - eventMin;
      } else {
        otMinutes = eventMin - endMin;
      }
    }

    return { lateMinutes, earlyLeaveMinutes, otMinutes };
  }

  async processPunch(userId: string, eventTime: Date) {
    const shift = await this.resolveShiftForUser(userId, eventTime);
    const workDate = this.workDateOnly(eventTime);
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId, date: workDate } },
    });

    // First punch of the day = check-in; subsequent = check-out (update).
    if (!existing?.checkInAt) {
      let lateMinutes = 0;
      if (shift) {
        // Late = after shift start (no grace period).
        const startMin = this.timeToMinutes(shift.startTime);
        const eventMin = this.eventToMinutes(eventTime);
        lateMinutes = Math.max(0, eventMin - startMin);
      }

      return this.prisma.attendanceRecord.upsert({
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
    }

    let earlyLeaveMinutes = 0;
    let otMinutes = 0;
    if (shift) {
      let endMin = this.timeToMinutes(shift.endTime);
      let eventMin = this.eventToMinutes(eventTime);
      if (shift.isOvernight && eventMin < this.timeToMinutes(shift.startTime)) {
        eventMin += 24 * 60;
        endMin += 24 * 60;
      }
      if (eventMin < endMin) {
        earlyLeaveMinutes = endMin - eventMin;
      } else {
        otMinutes = eventMin - endMin;
      }
    }

    const lateMinutes = existing.lateMinutes ?? 0;
    const status = this.computeStatus({
      lateMinutes,
      earlyLeaveMinutes,
      otMinutes,
      checkInAt: existing.checkInAt,
      checkOutAt: eventTime,
    });

    return this.prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        checkOutAt: eventTime,
        workShiftId: shift?.id ?? existing.workShiftId,
        earlyLeaveMinutes,
        otMinutes,
        status,
      },
    });
  }

  async findRecords(query: PaginationDto & { userId?: string; from?: string; to?: string }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        include: { user: true, workShift: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  findAccessLogs(limit = 20) {
    return this.prisma.accessLog.findMany({
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
        if (asDt) workDate = this.workDateOnly(asDt);
      }

      if (!workDate) {
        result.errors.push({ row: rowNumber, message: `Ngày không hợp lệ: ${dateRaw}` });
        continue;
      }

      // Persist date as UTC midnight for @db.Date consistency with processPunch
      workDate = this.workDateOnly(workDate);

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

      const computed = this.computeMetricsFromTimes(shift, checkInAt, checkOutAt);
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

      const status = this.computeStatus({
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

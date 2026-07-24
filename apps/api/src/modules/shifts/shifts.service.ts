import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkShiftDto } from './dto/create-work-shift.dto';
import { CreateEmployeeShiftDto } from './dto/create-employee-shift.dto';
import { BulkAssignEmployeeShiftDto } from './dto/bulk-assign-employee-shift.dto';
import { UpdateWorkShiftDto } from './dto/update-work-shift.dto';
import { UpdateEmployeeShiftDto } from './dto/update-employee-shift.dto';
import { parseIsoDateLocal } from '../../common/validators/date-range.validator';
import { findOverlappingShift, normalizeHhMm } from './shift-time.util';

const DEFAULT_SHIFT_KEY = 'default_work_shift_id';
const ASSIGN_FIXED = 'FIXED' as const;
const ASSIGN_RANGED = 'RANGED' as const;

function assertEndOnOrAfterStart(startRaw: string, endRaw: string) {
  const start = parseIsoDateLocal(startRaw);
  const end = parseIsoDateLocal(endRaw);
  if (!start || !end) {
    throw new BadRequestException('Ngày bắt đầu/kết thúc không hợp lệ');
  }
  if (end.getTime() < start.getTime()) {
    throw new BadRequestException('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
  }
}

function todayDateOnlyLocal(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function dateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Yesterday relative to a YYYY-MM-DD calendar day (UTC date string). */
function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  findWorkShifts() {
    return this.prisma.workShift.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' },
    });
  }

  async findWorkShift(id: string) {
    const shift = await this.prisma.workShift.findFirst({
      where: { id, isDeleted: false },
    });
    if (!shift) throw new NotFoundException('Work shift not found');
    return shift;
  }

  private async assertUniqueShiftHours(params: {
    startTime: string;
    endTime: string;
    isOvernight?: boolean;
    excludeId?: string;
  }) {
    const startTime = normalizeHhMm(params.startTime);
    const endTime = normalizeHhMm(params.endTime);
    const isOvernight = Boolean(params.isOvernight) || endTime <= startTime;

    if (!isOvernight && startTime === endTime) {
      throw new BadRequestException('Giờ kết thúc phải khác giờ bắt đầu');
    }

    const existing = await this.prisma.workShift.findMany({
      where: {
        isDeleted: false,
        ...(params.excludeId ? { NOT: { id: params.excludeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        startTime: true,
        endTime: true,
        isOvernight: true,
      },
    });

    const overlap = findOverlappingShift(
      { startTime, endTime, isOvernight },
      existing,
      params.excludeId,
    );
    if (overlap) {
      throw new BadRequestException(
        `Khung giờ trùng với ca "${overlap.name}" (${overlap.startTime}–${overlap.endTime}). Mỗi ca phải có giờ riêng, không chồng nhau.`,
      );
    }
  }

  async createWorkShift(dto: CreateWorkShiftDto) {
    const exists = await this.prisma.workShift.findFirst({
      where: { code: dto.code, isDeleted: false },
    });
    if (exists) throw new BadRequestException(`Mã ca ${dto.code} đã tồn tại`);

    const startTime = normalizeHhMm(dto.startTime);
    const endTime = normalizeHhMm(dto.endTime);
    // Never substitute default office hours — persist exactly what the client sent (normalized).
    const isOvernight = Boolean(dto.isOvernight) || endTime <= startTime;
    await this.assertUniqueShiftHours({ startTime, endTime, isOvernight });

    return this.prisma.workShift.create({
      data: {
        name: dto.name,
        code: dto.code,
        startTime,
        endTime,
        breakMinutes: dto.breakMinutes ?? 0,
        salaryCoefficient: dto.salaryCoefficient ?? 1,
        isOvernight,
        gracePeriodMinutes: dto.gracePeriodMinutes ?? 5,
      },
    });
  }

  async updateWorkShift(id: string, dto: UpdateWorkShiftDto) {
    const current = await this.findWorkShift(id);
    if (dto.code) {
      const exists = await this.prisma.workShift.findFirst({
        where: { code: dto.code, isDeleted: false, NOT: { id } },
      });
      if (exists) throw new BadRequestException(`Shift code ${dto.code} already exists`);
    }

    const startTime = normalizeHhMm(dto.startTime ?? current.startTime);
    const endTime = normalizeHhMm(dto.endTime ?? current.endTime);
    const isOvernight =
      dto.isOvernight !== undefined
        ? Boolean(dto.isOvernight) || endTime <= startTime
        : Boolean(current.isOvernight) || endTime <= startTime;

    await this.assertUniqueShiftHours({
      startTime,
      endTime,
      isOvernight,
      excludeId: id,
    });

    return this.prisma.workShift.update({
      where: { id },
      data: {
        ...dto,
        startTime: dto.startTime !== undefined ? startTime : undefined,
        endTime: dto.endTime !== undefined ? endTime : undefined,
        isOvernight:
          dto.isOvernight !== undefined || dto.startTime !== undefined || dto.endTime !== undefined
            ? isOvernight
            : undefined,
      },
    });
  }

  async removeWorkShift(id: string) {
    await this.findWorkShift(id);
    return this.prisma.workShift.update({
      where: { id },
      data: { isDeleted: true, isDefault: false },
    });
  }

  findEmployeeShifts(userId?: string) {
    return this.prisma.employeeShift.findMany({
      where: {
        isDeleted: false,
        ...(userId ? { userId } : {}),
      },
      include: { user: true, workShift: true },
      orderBy: { startDate: 'desc' },
    });
  }

  async createEmployeeShift(dto: CreateEmployeeShiftDto) {
    await this.findWorkShift(dto.workShiftId);
    const mode = dto.mode ?? ASSIGN_RANGED;
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    const todayStr = todayDateOnlyLocal();

    if (mode === ASSIGN_FIXED) {
      await this.closeActiveFixedAssignments([dto.userId], todayStr);
      return this.prisma.employeeShift.create({
        data: {
          userId: dto.userId,
          workShiftId: dto.workShiftId,
          startDate: new Date(`${todayStr}T00:00:00.000Z`),
          endDate: null,
          assignmentType: ASSIGN_FIXED,
        },
        include: { user: true, workShift: true },
      });
    }

    if (!dto.startDate || !dto.endDate) {
      throw new BadRequestException('Vui lòng chọn ngày bắt đầu và kết thúc');
    }
    assertEndOnOrAfterStart(dto.startDate, dto.endDate);

    return this.prisma.employeeShift.create({
      data: {
        userId: dto.userId,
        workShiftId: dto.workShiftId,
        startDate: new Date(`${dto.startDate}T00:00:00.000Z`),
        endDate: new Date(`${dto.endDate}T00:00:00.000Z`),
        assignmentType: ASSIGN_RANGED,
      },
      include: { user: true, workShift: true },
    });
  }

  /** End active FIXED assignments so a new FIXED can replace them. */
  private async closeActiveFixedAssignments(userIds: string[], todayStr: string) {
    const active = await this.prisma.employeeShift.findMany({
      where: {
        userId: { in: userIds },
        isDeleted: false,
        assignmentType: ASSIGN_FIXED,
        OR: [{ endDate: null }, { endDate: { gte: new Date(`${todayStr}T00:00:00.000Z`) } }],
      },
      select: { id: true, startDate: true },
    });

    for (const row of active) {
      const startStr = dateOnlyUtc(row.startDate);
      const closedEnd = todayStr <= startStr ? startStr : dayBefore(todayStr);
      await this.prisma.employeeShift.update({
        where: { id: row.id },
        data: { endDate: new Date(`${closedEnd}T00:00:00.000Z`) },
      });
    }
  }

  async bulkAssignEmployeeShift(dto: BulkAssignEmployeeShiftDto) {
    await this.findWorkShift(dto.workShiftId);
    const uniqueIds = Array.from(new Set(dto.userIds));
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isDeleted: false },
      select: { id: true },
    });
    const validIds = Array.from(new Set(users.map((u) => u.id)));

    if (dto.mode === ASSIGN_FIXED) {
      const todayStr = todayDateOnlyLocal();
      await this.closeActiveFixedAssignments(validIds, todayStr);

      if (validIds.length > 0) {
        await this.prisma.employeeShift.createMany({
          data: validIds.map((userId) => ({
            userId,
            workShiftId: dto.workShiftId,
            startDate: new Date(`${todayStr}T00:00:00.000Z`),
            endDate: null,
            assignmentType: ASSIGN_FIXED,
          })),
          skipDuplicates: true,
        });
      }

      return {
        assigned: validIds.length,
        skipped: 0,
        skippedUserIds: [] as string[],
        mode: ASSIGN_FIXED,
      };
    }

    if (!dto.startDate || !dto.endDate) {
      throw new BadRequestException('Vui lòng chọn ngày bắt đầu và kết thúc');
    }
    assertEndOnOrAfterStart(dto.startDate, dto.endDate);
    const startDate = new Date(`${dto.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${dto.endDate}T00:00:00.000Z`);

    // Skip users who already have an assignment still active on/after startDate
    const existing = await this.prisma.employeeShift.findMany({
      where: {
        userId: { in: validIds },
        isDeleted: false,
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
      select: { userId: true },
    });
    const skippedUserIds = Array.from(new Set(existing.map((e) => e.userId)));
    const skippedSet = new Set(skippedUserIds);
    const targetIds = validIds.filter((id) => !skippedSet.has(id));

    if (targetIds.length > 0) {
      await this.prisma.employeeShift.createMany({
        data: targetIds.map((userId) => ({
          userId,
          workShiftId: dto.workShiftId,
          startDate,
          endDate,
          assignmentType: ASSIGN_RANGED,
        })),
        skipDuplicates: true,
      });
    }

    return {
      assigned: targetIds.length,
      skipped: skippedUserIds.length,
      skippedUserIds,
      mode: ASSIGN_RANGED,
    };
  }

  async updateEmployeeShift(id: string, dto: UpdateEmployeeShiftDto) {
    const existing = await this.prisma.employeeShift.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Employee shift not found');
    if (dto.workShiftId) await this.findWorkShift(dto.workShiftId);

    const nextStart = dto.startDate
      ? dto.startDate
      : existing.startDate.toISOString().slice(0, 10);
    const nextEndRaw =
      dto.endDate !== undefined
        ? dto.endDate
        : existing.endDate
          ? existing.endDate.toISOString().slice(0, 10)
          : null;
    if (nextEndRaw) {
      assertEndOnOrAfterStart(nextStart, nextEndRaw);
    }

    return this.prisma.employeeShift.update({
      where: { id },
      data: {
        ...(dto.workShiftId ? { workShiftId: dto.workShiftId } : {}),
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
      },
      include: { user: true, workShift: true },
    });
  }

  async endEmployeeShift(id: string, endDate?: string) {
    const existing = await this.prisma.employeeShift.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Employee shift not found');

    // Use calendar date (YYYY-MM-DD) to avoid UTC timezone shifting @db.Date.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const startStr = existing.startDate.toISOString().slice(0, 10);
    const endStrRaw = endDate?.trim() || todayStr;
    // If ending before start (ca chưa tới ngày), treat as cancel-on-start-day.
    const endStr = endStrRaw < startStr ? startStr : endStrRaw;

    if (existing.endDate) {
      const currentEnd = existing.endDate.toISOString().slice(0, 10);
      if (currentEnd < todayStr) {
        throw new BadRequestException('Ca này đã kết thúc trước đó');
      }
    }

    assertEndOnOrAfterStart(startStr, endStr);

    return this.prisma.employeeShift.update({
      where: { id },
      data: { endDate: new Date(`${endStr}T00:00:00.000Z`) },
      include: { user: true, workShift: true },
    });
  }

  async removeEmployeeShift(id: string) {
    const existing = await this.prisma.employeeShift.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Employee shift not found');
    return this.prisma.employeeShift.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async getDefaultShift() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: DEFAULT_SHIFT_KEY },
    });
    if (!setting) {
      return this.prisma.workShift.findFirst({
        where: { isDeleted: false, isDefault: true },
      });
    }
    return this.prisma.workShift.findFirst({
      where: { id: setting.value, isDeleted: false },
    });
  }

  async setDefaultShift(workShiftId: string) {
    await this.findWorkShift(workShiftId);
    await this.prisma.$transaction([
      this.prisma.workShift.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.workShift.update({
        where: { id: workShiftId },
        data: { isDefault: true },
      }),
      this.prisma.systemSetting.upsert({
        where: { key: DEFAULT_SHIFT_KEY },
        create: { key: DEFAULT_SHIFT_KEY, value: workShiftId },
        update: { value: workShiftId },
      }),
    ]);
    return this.findWorkShift(workShiftId);
  }
}

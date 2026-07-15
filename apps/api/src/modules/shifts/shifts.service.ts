import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkShiftDto } from './dto/create-work-shift.dto';
import { CreateEmployeeShiftDto } from './dto/create-employee-shift.dto';
import { BulkAssignEmployeeShiftDto } from './dto/bulk-assign-employee-shift.dto';
import { UpdateWorkShiftDto } from './dto/update-work-shift.dto';
import { UpdateEmployeeShiftDto } from './dto/update-employee-shift.dto';

const DEFAULT_SHIFT_KEY = 'default_work_shift_id';

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

  async createWorkShift(dto: CreateWorkShiftDto) {
    const exists = await this.prisma.workShift.findFirst({
      where: { code: dto.code, isDeleted: false },
    });
    if (exists) throw new BadRequestException(`Shift code ${dto.code} already exists`);
    return this.prisma.workShift.create({ data: dto });
  }

  async updateWorkShift(id: string, dto: UpdateWorkShiftDto) {
    await this.findWorkShift(id);
    if (dto.code) {
      const exists = await this.prisma.workShift.findFirst({
        where: { code: dto.code, isDeleted: false, NOT: { id } },
      });
      if (exists) throw new BadRequestException(`Shift code ${dto.code} already exists`);
    }
    return this.prisma.workShift.update({ where: { id }, data: dto });
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
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.employeeShift.create({
      data: {
        userId: dto.userId,
        workShiftId: dto.workShiftId,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      include: { user: true, workShift: true },
    });
  }

  async bulkAssignEmployeeShift(dto: BulkAssignEmployeeShiftDto) {
    await this.findWorkShift(dto.workShiftId);
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    const uniqueIds = Array.from(new Set(dto.userIds));

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isDeleted: false },
      select: { id: true },
    });
    const validIds = new Set(users.map((u) => u.id));

    // Skip users who already have an assignment still active on/after startDate
    const existing = await this.prisma.employeeShift.findMany({
      where: {
        userId: { in: Array.from(validIds) },
        isDeleted: false,
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
      select: { userId: true },
    });
    const skippedUserIds = Array.from(new Set(existing.map((e) => e.userId)));
    const skippedSet = new Set(skippedUserIds);

    const targetIds = Array.from(validIds).filter((id) => !skippedSet.has(id));

    if (targetIds.length > 0) {
      await this.prisma.employeeShift.createMany({
        data: targetIds.map((userId) => ({
          userId,
          workShiftId: dto.workShiftId,
          startDate,
          endDate,
        })),
        skipDuplicates: true,
      });
    }

    return {
      assigned: targetIds.length,
      skipped: skippedUserIds.length,
      skippedUserIds,
    };
  }

  async updateEmployeeShift(id: string, dto: UpdateEmployeeShiftDto) {
    const existing = await this.prisma.employeeShift.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Employee shift not found');
    if (dto.workShiftId) await this.findWorkShift(dto.workShiftId);

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

    return this.prisma.employeeShift.update({
      where: { id },
      data: { endDate: endDate ? new Date(endDate) : new Date() },
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

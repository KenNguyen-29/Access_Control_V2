import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  ACCESS_ZONE_SCHEDULES_KEY,
  isAllDayScheduleName,
} from './constants/schedule.constants';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async getZoneSchedulesMap(): Promise<Record<string, string>> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { key: ACCESS_ZONE_SCHEDULES_KEY },
    });
    if (!row?.value) return {};
    try {
      const parsed = JSON.parse(row.value) as { schedules?: Record<string, string> };
      return parsed.schedules ?? {};
    } catch {
      return {};
    }
  }

  async getUserAccessSummary(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      include: { department: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const [permissions, credentials, schedulesMap] = await Promise.all([
      this.prisma.userAccessPermission.findMany({
        where: { userId, isDeleted: false },
        include: { zone: true },
        orderBy: { zone: { name: 'asc' } },
      }),
      this.prisma.credential.findMany({
        where: { userId, isDeleted: false, isActive: true },
        select: { id: true, type: true, isActive: true, syncStatus: true },
      }),
      this.getZoneSchedulesMap(),
    ]);

    const zoneIds = permissions.map((p) => p.zoneId);
    const scheduleNames = [
      ...new Set(
        permissions
          .map((p) => schedulesMap[String(p.zoneId)])
          .filter((n): n is string => Boolean(n)),
      ),
    ];

    const devices = zoneIds.length
      ? await this.prisma.device.findMany({
          where: { zoneId: { in: zoneIds }, isDeleted: false },
          orderBy: { name: 'asc' },
        })
      : [];
    const shifts = scheduleNames.length
      ? await this.prisma.workShift.findMany({
          where: { name: { in: scheduleNames }, isDeleted: false },
        })
      : [];

    const shiftByName = new Map(shifts.map((s) => [s.name, s]));

    const zones = permissions.map((p) => {
      const scheduleName = schedulesMap[String(p.zoneId)] ?? null;
      const allDay = scheduleName ? isAllDayScheduleName(scheduleName) : true;
      const shift = scheduleName ? shiftByName.get(scheduleName) : null;
      return {
        zoneId: p.zoneId,
        zoneName: p.zone?.name ?? p.zoneId,
        permissionId: p.id,
        scheduleName,
        scheduleWindow:
          !allDay && shift
            ? { start: shift.startTime, end: shift.endTime }
            : null,
        isAllDay: allDay,
        devices: devices
          .filter((d) => d.zoneId === p.zoneId)
          .map((d) => ({
            deviceId: d.id,
            deviceName: d.name,
            deviceCode: d.code,
            syncStatus: d.syncStatus,
          })),
      };
    });

    return {
      user: {
        userId: user.id,
        fullName: user.fullName,
        employeeCode: user.employeeCode,
        photoUrl: user.faceImagePath
          ? this.storage.getBrowserFileUrl(user.faceImagePath)
          : null,
        departmentName: user.department?.name ?? null,
      },
      credentials,
      zones,
    };
  }

  async assign(data: {
    userId: string;
    zoneId: string;
    validFrom?: Date;
    validTo?: Date;
  }) {
    const existing = await this.prisma.userAccessPermission.findFirst({
      where: { userId: data.userId, zoneId: data.zoneId },
    });
    if (existing) {
      return this.prisma.userAccessPermission.update({
        where: { id: existing.id },
        data: {
          isDeleted: false,
          validFrom: data.validFrom,
          validTo: data.validTo,
        },
      });
    }
    return this.prisma.userAccessPermission.create({ data });
  }

  async findAll(userId?: string, zoneId?: string) {
    return this.prisma.userAccessPermission.findMany({
      where: {
        isDeleted: false,
        ...(userId ? { userId } : {}),
        ...(zoneId ? { zoneId } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            departmentId: true,
            faceImagePath: true,
            department: { select: { name: true } },
          },
        },
        zone: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string) {
    const item = await this.prisma.userAccessPermission.findFirst({
      where: { id, isDeleted: false },
    });
    if (!item) throw new NotFoundException('Permission not found');
    return this.prisma.userAccessPermission.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async checkAccess(userId: string, zoneId: string) {
    const at = new Date();
    const permission = await this.prisma.userAccessPermission.findFirst({
      where: {
        userId,
        zoneId,
        isDeleted: false,
        OR: [
          { validFrom: null, validTo: null },
          { validFrom: { lte: at }, validTo: { gte: at } },
          { validFrom: { lte: at }, validTo: null },
          { validFrom: null, validTo: { gte: at } },
        ],
      },
    });
    if (!permission) {
      return { allowed: false, permission: null, reason: 'NO_ZONE_PERMISSION' as const };
    }
    return { allowed: true, permission };
  }
}

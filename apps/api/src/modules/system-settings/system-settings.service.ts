import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const ACCESS_ZONE_SCHEDULES_KEY = 'ACCESS_ZONE_SCHEDULES_JSON';

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async findByKey(key: string) {
    const item = await this.prisma.systemSetting.findFirst({ where: { key } });
    if (!item) throw new NotFoundException('Setting not found');
    return item;
  }

  async upsert(key: string, value: string, actorId?: string) {
    const old = await this.prisma.systemSetting.findFirst({ where: { key } });
    const item = old
      ? await this.prisma.systemSetting.update({
          where: { id: old.id },
          data: { value },
        })
      : await this.prisma.systemSetting.create({ data: { key, value } });

    await this.prisma.auditLog.create({
      data: {
        action: old ? 'UPDATE' : 'CREATE',
        entity: 'system_settings',
        entityId: key,
        actorId,
        metadata: { old: old?.value, new: value },
      },
    });

    return item;
  }

  async getAccessZoneSchedules(): Promise<{ schedules: Record<string, string> }> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { key: ACCESS_ZONE_SCHEDULES_KEY },
    });
    if (!row?.value) return { schedules: {} };
    try {
      const parsed = JSON.parse(row.value) as { schedules?: Record<string, string> };
      return { schedules: parsed.schedules ?? {} };
    } catch {
      return { schedules: {} };
    }
  }

  async putAccessZoneSchedules(
    schedules: Record<string, string>,
    actorId?: string,
  ) {
    const value = JSON.stringify({ schedules });
    await this.upsert(ACCESS_ZONE_SCHEDULES_KEY, value, actorId);
    return { schedules };
  }
}

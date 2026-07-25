import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SETTING_KEY } from '../system-settings/system-setting-keys';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    await this.runPurge('cron');
  }

  async runPurge(trigger: 'cron' | 'manual' = 'manual') {
    if (this.running) {
      return { skipped: true as const, reason: 'already_running' };
    }
    this.running = true;
    try {
      const [attendanceDays, logDays, storageDays] = await Promise.all([
        this.settings.getNumber(SETTING_KEY.ATTENDANCE_RETENTION_DAYS, 90),
        this.settings.getNumber(SETTING_KEY.LOG_RETENTION_DAYS, 90),
        this.settings.getNumber(SETTING_KEY.STORAGE_RETENTION_DAYS, 30),
      ]);

      const clampedAttendance = Math.min(90, Math.max(60, attendanceDays));
      const attendanceCutoff = this.utcDaysAgo(clampedAttendance);
      const logCutoff = this.utcDaysAgo(Math.max(1, logDays));
      const storageCutoff = new Date(Date.now() - Math.max(1, storageDays) * 86400000);

      const [attendanceDeleted, accessLogDeleted, auditDeleted] = await Promise.all([
        this.prisma.attendanceRecord.deleteMany({
          where: { date: { lt: attendanceCutoff } },
        }),
        this.prisma.accessLog.deleteMany({
          where: { eventAt: { lt: logCutoff } },
        }),
        this.prisma.auditLog.deleteMany({
          where: { createdAt: { lt: logCutoff } },
        }),
      ]);

      const snapshotsDeleted = await this.storage.deleteObjectsOlderThan(
        'snapshots/',
        storageCutoff,
      );

      const result = {
        trigger,
        attendanceRetentionDays: clampedAttendance,
        logRetentionDays: logDays,
        storageRetentionDays: storageDays,
        attendanceDeleted: attendanceDeleted.count,
        accessLogDeleted: accessLogDeleted.count,
        auditLogDeleted: auditDeleted.count,
        snapshotsDeleted,
        ranAt: new Date().toISOString(),
      };

      await this.prisma.auditLog.create({
        data: {
          action: 'PURGE',
          entity: 'retention',
          metadata: result,
        },
      });

      this.logger.log(
        `Retention purge (${trigger}): attendance=${result.attendanceDeleted}, accessLog=${result.accessLogDeleted}, audit=${result.auditLogDeleted}, snapshots=${result.snapshotsDeleted}`,
      );

      return result;
    } finally {
      this.running = false;
    }
  }

  private utcDaysAgo(days: number): Date {
    const d = new Date();
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    utc.setUTCDate(utc.getUTCDate() - days);
    return utc;
  }
}

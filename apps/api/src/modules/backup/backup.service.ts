import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SETTING_KEY } from '../system-settings/system-setting-keys';

const execFileAsync = promisify(execFile);
const BACKUP_JOB_NAME = 'postgres-backup';

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SystemSettingsService,
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
  ) {
    this.backupDir = resolve(
      this.config.get<string>('BACKUP_DIR') || join(process.cwd(), 'backups'),
    );
  }

  async onModuleInit() {
    mkdirSync(this.backupDir, { recursive: true });
    await this.rescheduleFromSettings();
  }

  onModuleDestroy() {
    this.stopJob();
  }

  async rescheduleFromSettings() {
    const enabled = await this.settings.getBoolean(SETTING_KEY.BACKUP_ENABLED, false);
    const cronExpr = await this.settings.getRawOrDefault(
      SETTING_KEY.BACKUP_CRON,
      '0 2 * * *',
    );
    this.stopJob();
    if (!enabled) {
      this.logger.log('Postgres backup schedule disabled');
      return;
    }
    try {
      const job = new CronJob(cronExpr, () => {
        void this.runBackup('cron');
      });
      this.scheduler.addCronJob(BACKUP_JOB_NAME, job);
      job.start();
      this.logger.log(`Postgres backup scheduled: ${cronExpr}`);
    } catch (err) {
      this.logger.error(`Invalid backup cron "${cronExpr}": ${err}`);
    }
  }

  private stopJob() {
    try {
      this.scheduler.deleteCronJob(BACKUP_JOB_NAME);
    } catch {
      /* job may not exist yet */
    }
  }

  async getStatus() {
    const [enabled, cron, retentionDays] = await Promise.all([
      this.settings.getBoolean(SETTING_KEY.BACKUP_ENABLED, false),
      this.settings.getRawOrDefault(SETTING_KEY.BACKUP_CRON, '0 2 * * *'),
      this.settings.getNumber(SETTING_KEY.BACKUP_RETENTION_DAYS, 14),
    ]);
    const files = this.listBackupFiles();
    return {
      enabled,
      cron,
      retentionDays,
      backupDir: this.backupDir,
      files,
    };
  }

  listBackupFiles() {
    if (!existsSync(this.backupDir)) return [];
    return readdirSync(this.backupDir)
      .filter((f) => f.endsWith('.sql') || f.endsWith('.sql.gz'))
      .map((name) => {
        const full = join(this.backupDir, name);
        const st = statSync(full);
        return { name, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  }

  async runBackup(trigger: 'cron' | 'manual' = 'manual') {
    if (this.running) {
      return { skipped: true as const, reason: 'already_running' };
    }
    this.running = true;
    try {
      mkdirSync(this.backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `acv2-${stamp}.sql`;
      const outPath = join(this.backupDir, fileName);

      const databaseUrl =
        this.config.get<string>('DATABASE_URL') || process.env.DATABASE_URL || '';
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not configured');
      }

      const pgDump = this.config.get<string>('PG_DUMP_PATH') || 'pg_dump';
      await execFileAsync(
        pgDump,
        ['--dbname', databaseUrl, '--no-owner', '--no-acl', '--file', outPath],
        { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      );

      const retentionDays = await this.settings.getNumber(
        SETTING_KEY.BACKUP_RETENTION_DAYS,
        14,
      );
      const pruned = this.pruneOldBackups(retentionDays);

      const result = {
        trigger,
        fileName,
        path: outPath,
        pruned,
        ranAt: new Date().toISOString(),
      };

      await this.prisma.auditLog.create({
        data: {
          action: 'BACKUP',
          entity: 'postgres',
          metadata: result,
        },
      });

      this.logger.log(`Postgres backup ok: ${fileName} (pruned ${pruned})`);
      return result;
    } finally {
      this.running = false;
    }
  }

  private pruneOldBackups(retentionDays: number): number {
    const cutoff = Date.now() - Math.max(1, retentionDays) * 86400000;
    let pruned = 0;
    for (const f of this.listBackupFiles()) {
      if (new Date(f.mtime).getTime() < cutoff) {
        try {
          unlinkSync(join(this.backupDir, f.name));
          pruned += 1;
        } catch (err) {
          this.logger.warn(`Failed to prune backup ${f.name}: ${err}`);
        }
      }
    }
    return pruned;
  }
}

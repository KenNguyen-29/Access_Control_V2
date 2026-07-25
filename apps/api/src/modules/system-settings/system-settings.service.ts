import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACCESS_ZONE_SCHEDULES_KEY,
  ALLOWED_SETTING_KEYS,
  SETTING_RULES,
  isMaskedSecretInput,
  maskSecret,
  validateSettingValue,
} from './system-setting-keys';

export { ACCESS_ZONE_SCHEDULES_KEY };

type CacheEntry = { value: string; at: number };

@Injectable()
export class SystemSettingsService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  private present(row: { id: string; key: string; value: string; createdAt: Date; updatedAt: Date }) {
    const rule = SETTING_RULES[row.key];
    if (rule?.secret) {
      return { ...row, value: maskSecret(row.value), isMasked: true as const };
    }
    return { ...row, isMasked: false as const };
  }

  findAll() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }).then((rows) =>
      rows.map((r) => this.present(r)),
    );
  }

  async findByKey(key: string) {
    const item = await this.prisma.systemSetting.findFirst({ where: { key } });
    if (!item) throw new NotFoundException('Setting not found');
    return this.present(item);
  }

  invalidateCache(key?: string) {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  /** Raw DB value (unmasked). Uses short TTL cache. */
  async getRaw(key: string): Promise<string | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.cacheTtlMs) return hit.value;

    const item = await this.prisma.systemSetting.findFirst({ where: { key } });
    const value = item?.value ?? null;
    if (value != null) this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  async getRawOrDefault(key: string, fallback: string): Promise<string> {
    const raw = await this.getRaw(key);
    if (raw == null || raw === '') {
      const rule = SETTING_RULES[key];
      return rule?.defaultValue ?? fallback;
    }
    return raw;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const raw = await this.getRaw(key);
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  async getBoolean(key: string, fallback = false): Promise<boolean> {
    const raw = await this.getRaw(key);
    if (raw == null || raw === '') return fallback;
    return raw.toLowerCase() === 'true';
  }

  async upsert(key: string, value: string, actorId?: string) {
    if (!ALLOWED_SETTING_KEYS.has(key)) {
      throw new BadRequestException(`Khóa cài đặt không được phép: ${key}`);
    }

    const rule = SETTING_RULES[key];
    const old = await this.prisma.systemSetting.findFirst({ where: { key } });

    let nextValue = value;
    if (rule?.secret && isMaskedSecretInput(value)) {
      // Keep existing secret when UI posts masked placeholder.
      if (!old) {
        throw new BadRequestException('Vui lòng nhập token mới (không gửi giá trị đã che)');
      }
      return this.present(old);
    }

    try {
      nextValue = validateSettingValue(key, value);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Giá trị không hợp lệ');
    }

    const item = old
      ? await this.prisma.systemSetting.update({
          where: { id: old.id },
          data: { value: nextValue },
        })
      : await this.prisma.systemSetting.create({ data: { key, value: nextValue } });

    this.invalidateCache(key);

    await this.prisma.auditLog.create({
      data: {
        action: old ? 'UPDATE' : 'CREATE',
        entity: 'system_settings',
        entityId: key,
        actorId,
        metadata: {
          old: rule?.secret ? maskSecret(old?.value ?? '') : old?.value,
          new: rule?.secret ? maskSecret(nextValue) : nextValue,
        },
      },
    });

    return this.present(item);
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

  async putAccessZoneSchedules(schedules: Record<string, string>, actorId?: string) {
    const value = JSON.stringify({ schedules });
    await this.upsert(ACCESS_ZONE_SCHEDULES_KEY, value, actorId);
    return { schedules };
  }
}

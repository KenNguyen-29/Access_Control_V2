import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, DeviceSyncStatus, DeviceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export type DnakeConfig = {
  username?: string;
  password?: string;
  protocol?: 'http' | 'https';
  relay?: number;
  /** Last unlock log timestamp (unix seconds) successfully ingested */
  lastUnlockTs?: number;
};

type DnakeApiResponse = {
  code?: number;
  message?: string;
  timestamp?: number;
  data?: unknown;
};

@Injectable()
export class DnakeService {
  private readonly logger = new Logger(DnakeService.name);
  private readonly mockMode: boolean;
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.mockMode = this.config.get<string>('DNAKE_MOCK_MODE', 'true') === 'true';
    this.timeoutMs = Number(this.config.get<string>('DNAKE_REQUEST_TIMEOUT', '15000'));
  }

  parseConfig(device: Device): DnakeConfig {
    const raw = device.dnakeConfig;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as DnakeConfig;
  }

  private async getDnakeDevice(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (device.deviceType !== DeviceType.DNAKE) {
      throw new BadRequestException('Device is not a DNAKE panel');
    }
    if (!device.ipAddress && !this.mockMode) {
      throw new BadRequestException('Device IP address is required');
    }
    return device;
  }

  private md5(value: string) {
    return createHash('md5').update(value, 'utf8').digest('hex');
  }

  private credentials(device: Device) {
    const cfg = this.parseConfig(device);
    const username = cfg.username?.trim();
    const password = cfg.password?.trim();
    if (!username || !password) {
      throw new BadRequestException(
        'Thiết bị chưa cấu hình tài khoản DNAKE — nhập Username/Password trên trang Thiết bị',
      );
    }
    return { username, passwordMd5: this.md5(password), passwordPlain: password };
  }

  private buildUrl(device: Device, path: string, extraQuery?: Record<string, string>) {
    const cfg = this.parseConfig(device);
    const protocol = cfg.protocol || 'http';
    const base = `${protocol}://${device.ipAddress}`.replace(/\/$/, '');
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const { username, passwordMd5 } = this.credentials(device);
    const q = new URLSearchParams({
      username,
      password: passwordMd5,
      ...(extraQuery ?? {}),
    });
    const sep = normalized.includes('?') ? '&' : '?';
    return `${base}${normalized}${sep}${q.toString()}`;
  }

  private isOk(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const code = (data as DnakeApiResponse).code;
    return code === 0;
  }

  private async request(
    device: Device,
    path: string,
    init?: RequestInit & { extraQuery?: Record<string, string> },
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    if (this.mockMode) {
      this.logger.log(`[MOCK] ${init?.method || 'GET'} ${path} device=${device.code}`);
      return { ok: true, status: 200, data: { code: 0, message: 'OK', data: { mock: true } } };
    }

    const { extraQuery, ...fetchInit } = init ?? {};
    const url = this.buildUrl(device, path, extraQuery);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });
      let data: unknown = null;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { ok: res.ok && this.isOk(data), status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(deviceId: string) {
    const device = await this.getDnakeDevice(deviceId);
    const login = await this.request(device, '/api/v1/login', { method: 'GET' });
    if (!login.ok && !this.mockMode) {
      const msg =
        login.data && typeof login.data === 'object' && 'message' in login.data
          ? String((login.data as DnakeApiResponse).message)
          : `HTTP ${login.status}`;
      throw new BadRequestException(`DNAKE login failed: ${msg}`);
    }
    const info = await this.request(device, '/api/v1/device/info', { method: 'GET' });
    await this.prisma.device.update({
      where: { id: device.id },
      data: { isOnline: info.ok || this.mockMode, lastHeartbeat: new Date() },
    });
    return {
      ok: info.ok || this.mockMode,
      deviceId: device.id,
      info: info.data,
      mock: this.mockMode,
    };
  }

  private readFaceBuffer(faceImagePath?: string | null): Buffer | null {
    if (!faceImagePath) return null;
    try {
      if (!this.storage.existsOnDisk(faceImagePath)) return null;
      return readFileSync(this.storage.resolveLocalPath(faceImagePath));
    } catch (err) {
      this.logger.warn(`Cannot read face file ${faceImagePath}: ${err}`);
      return null;
    }
  }

  private async listUsers(device: Device): Promise<Array<Record<string, unknown>>> {
    const result = await this.request(device, '/api/v1/device/user/list', { method: 'GET' });
    if (!result.ok) return [];
    const data = (result.data as DnakeApiResponse)?.data;
    return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  }

  private findUserIndex(
    users: Array<Record<string, unknown>>,
    employeeCode: string,
  ): number | null {
    const idx = users.findIndex((u) => {
      const uid = String(u.user_id ?? u.uid ?? '');
      const room = String(u.room ?? '');
      const name = String(u.name ?? '');
      return uid === employeeCode || room === employeeCode || name === employeeCode;
    });
    return idx >= 0 ? idx : null;
  }

  private async syncUserToDevice(
    device: Device,
    user: { employeeCode: string; fullName: string; faceImagePath?: string | null },
    cred?: { cardNumber?: string | null },
  ) {
    const cfg = this.parseConfig(device);
    const relay = cfg.relay ?? 1;
    const existing = await this.listUsers(device);
    const index = this.findUserIndex(existing, user.employeeCode);
    const action = index === null ? '1' : '2';

    const form = new FormData();
    form.append('action', action);
    form.append('group', '-1');
    form.append('index', index === null ? '0' : String(index));
    form.append('name', user.fullName || user.employeeCode);
    form.append('user_id', user.employeeCode);
    form.append('passEnable', '0');
    form.append('passNum', '0');
    form.append('pinMode', '0');
    form.append('pinCode', '');
    form.append('cards', cred?.cardNumber?.trim() || '');
    form.append('relays', String(Math.max(0, relay - 1)));
    form.append('room', user.employeeCode);
    form.append('activeEnable', '1');
    form.append('activeWeek', '1;1;1;1;1;1;1');
    form.append('start_date', '2020-01-01');
    form.append('start_time', '00:00');
    form.append('end_date', '2099-12-31');
    form.append('end_time', '23:59');
    form.append('status', '1');
    form.append('type', '2'); // Staff

    const face = this.readFaceBuffer(user.faceImagePath);
    if (face) {
      form.append(
        'file',
        new Blob([new Uint8Array(face)], { type: 'image/jpeg' }),
        `${user.employeeCode}.jpg`,
      );
    }

    if (this.mockMode) {
      this.logger.log(
        `[MOCK] sync user=${user.employeeCode} action=${action} device=${device.code} face=${Boolean(face)}`,
      );
      return { ok: true, status: 200, data: { code: 0, message: 'OK' } };
    }

    return this.request(device, '/api/v1/device/user/list', {
      method: 'POST',
      body: form,
    });
  }

  async syncCredentials(deviceId: string) {
    const device = await this.getDnakeDevice(deviceId);
    await this.prisma.device.update({
      where: { id: device.id },
      data: { syncStatus: DeviceSyncStatus.PENDING },
    });

    try {
      const credentials = await this.prisma.credential.findMany({
        where: { isDeleted: false, isActive: true },
        include: { user: true },
        take: 500,
      });

      let synced = 0;
      for (const cred of credentials) {
        if (!cred.user || cred.user.isDeleted) continue;
        const result = await this.syncUserToDevice(device, cred.user, cred);
        if (result.ok) {
          synced += 1;
          await this.prisma.credential.update({
            where: { id: cred.id },
            data: { syncStatus: DeviceSyncStatus.SYNCED },
          });
        } else {
          this.logger.warn(
            `DNAKE sync failed user=${cred.user.employeeCode} device=${device.code}`,
          );
        }
      }

      await this.prisma.device.update({
        where: { id: device.id },
        data: {
          syncStatus: DeviceSyncStatus.SYNCED,
          isOnline: true,
          lastHeartbeat: new Date(),
        },
      });

      return { synced, total: credentials.length, deviceId: device.id };
    } catch (err) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { syncStatus: DeviceSyncStatus.FAILED },
      });
      throw err;
    }
  }

  async syncUserCredentials(userId: string, zoneId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      include: { credentials: { where: { isDeleted: false, isActive: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.credentials.length === 0 && !user.faceImagePath) {
      throw new BadRequestException('Nhân viên chưa có credential để đồng bộ');
    }

    const permissions = await this.prisma.userAccessPermission.findMany({
      where: { userId, isDeleted: false },
      include: { zone: { select: { id: true, name: true } } },
    });

    let targetZoneIds: string[];
    if (zoneId) {
      if (!permissions.some((p) => p.zoneId === zoneId)) {
        throw new BadRequestException('Nhân viên chưa được cấp quyền khu vực này');
      }
      targetZoneIds = [zoneId];
    } else {
      targetZoneIds = permissions.map((p) => p.zoneId);
    }

    if (targetZoneIds.length === 0) {
      throw new BadRequestException('Nhân viên chưa được gán khu vực nào');
    }

    const devices = await this.prisma.device.findMany({
      where: {
        deviceType: DeviceType.DNAKE,
        isDeleted: false,
        zoneId: { in: targetZoneIds },
      },
      include: { zone: { select: { id: true, name: true } } },
    });

    const zoneNameById = new Map(permissions.map((p) => [p.zoneId, p.zone?.name ?? p.zoneId]));

    let synced = 0;
    const results: Array<{
      deviceId: string;
      deviceName: string;
      zoneId: string | null;
      zoneName?: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const device of devices) {
      const zoneName = device.zoneId ? zoneNameById.get(device.zoneId) : undefined;
      try {
        let deviceOk = true;
        const syncEntries = user.credentials.length > 0 ? user.credentials : [null];
        for (const cred of syncEntries) {
          const result = await this.syncUserToDevice(device, user, cred ?? undefined);
          if (result.ok) {
            synced += 1;
            if (cred) {
              await this.prisma.credential.update({
                where: { id: cred.id },
                data: { syncStatus: DeviceSyncStatus.SYNCED },
              });
            }
          } else {
            deviceOk = false;
            results.push({
              deviceId: device.id,
              deviceName: device.name,
              zoneId: device.zoneId,
              zoneName,
              ok: false,
              error: 'DNAKE sync failed',
            });
          }
        }
        if (deviceOk) {
          results.push({
            deviceId: device.id,
            deviceName: device.name,
            zoneId: device.zoneId,
            zoneName,
            ok: true,
          });
        }
      } catch (err) {
        results.push({
          deviceId: device.id,
          deviceName: device.name,
          zoneId: device.zoneId,
          zoneName,
          ok: false,
          error: err instanceof Error ? err.message : 'error',
        });
      }
    }

    return {
      synced,
      devices: devices.length,
      results,
      mock: this.mockMode,
    };
  }

  async fetchUnlockLogs(device: Device): Promise<
    Array<{
      group: string;
      relay: string;
      status: number;
      ts: number;
      unlock_type: number;
      user_type: number;
      name: string;
      number: string;
    }>
  > {
    const result = await this.request(device, '/api/v1/logs/unlock', { method: 'GET' });
    if (!result.ok && !this.mockMode) return [];
    const data = (result.data as DnakeApiResponse)?.data;
    if (!Array.isArray(data)) return [];
    return data as Array<{
      group: string;
      relay: string;
      status: number;
      ts: number;
      unlock_type: number;
      user_type: number;
      name: string;
      number: string;
    }>;
  }

  async updateLastUnlockTs(deviceId: string, ts: number) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId } });
    if (!device) return;
    const cfg = this.parseConfig(device);
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        dnakeConfig: { ...cfg, lastUnlockTs: ts },
        lastHeartbeat: new Date(),
        isOnline: true,
      },
    });
  }

  async listActiveDevices() {
    return this.prisma.device.findMany({
      where: { deviceType: DeviceType.DNAKE, isDeleted: false },
    });
  }
}

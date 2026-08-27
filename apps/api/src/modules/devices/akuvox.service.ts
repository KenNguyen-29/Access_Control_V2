import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, DeviceSyncStatus, DeviceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

type AkuvoxConfig = {
  username?: string;
  password?: string;
  protocol?: 'http' | 'https';
  relay?: number;
  authMode?: 'basic';
  apiVersion?: 'modern' | 'legacy';
  scheduleRelay?: string;
};

@Injectable()
export class AkuvoxService {
  private readonly logger = new Logger(AkuvoxService.name);
  private readonly mockMode: boolean;
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.mockMode = this.config.get<string>('AKUVOX_MOCK_MODE', 'true') === 'true';
    this.timeoutMs = Number(this.config.get<string>('AKUVOX_REQUEST_TIMEOUT', '15000'));
  }

  private parseConfig(device: Device): AkuvoxConfig {
    const raw = device.akuvoxConfig;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as AkuvoxConfig;
  }

  private async getAkuvoxDevice(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (device.deviceType !== DeviceType.AKUVOX) {
      throw new BadRequestException('Device is not an Akuvox panel');
    }
    if (!device.ipAddress && !this.mockMode) {
      throw new BadRequestException('Device IP address is required');
    }
    return device;
  }

  private buildUrl(device: Device, path: string) {
    const cfg = this.parseConfig(device);
    const protocol = cfg.protocol || 'http';
    const base = `${protocol}://${device.ipAddress}`.replace(/\/$/, '');
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalized}`;
  }

  private authHeader(device: Device) {
    const cfg = this.parseConfig(device);
    const username = cfg.username?.trim();
    const password = cfg.password?.trim();
    if (!username || !password) {
      throw new BadRequestException(
        'Thiết bị chưa cấu hình tài khoản Akuvox — nhập Username/Password trên trang Thiết bị',
      );
    }
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${token}`;
  }

  private parseRetcode(data: unknown): number | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const retcode = (data as { retcode?: unknown }).retcode;
    if (typeof retcode === 'number') return retcode;
    if (typeof retcode === 'string' && retcode.trim() !== '') {
      const parsed = Number(retcode);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private parseMessage(data: unknown): string | undefined {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
    const message = (data as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }

  private isSuccessfulResponse(result: {
    ok: boolean;
    status: number;
    data: unknown;
  }) {
    if (!result.ok) return false;
    const retcode = this.parseRetcode(result.data);
    const message = this.parseMessage(result.data)?.trim().toUpperCase();
    if (retcode === null) return true;
    if (message === 'OK') return true;
    return retcode >= 0 && retcode <= 2;
  }

  private buildErrorMessage(result: {
    ok: boolean;
    status: number;
    data: unknown;
  }) {
    const message = this.parseMessage(result.data);
    const retcode = this.parseRetcode(result.data);
    if (message && retcode !== null) return `${message} (retcode ${retcode})`;
    if (message) return message;
    if (retcode !== null) return `retcode ${retcode}`;
    return `HTTP ${result.status}`;
  }

  private buildLegacyPayload(
    user: { employeeCode: string; fullName: string; faceImagePath?: string | null },
    faceUrl?: string,
  ) {
    return {
      UserID: user.employeeCode,
      Name: user.fullName,
      PrivateKey: user.employeeCode,
      FaceURL: user.faceImagePath ? faceUrl : undefined,
    };
  }

  private buildModernUserItem(
    device: Device,
    user: { employeeCode: string; fullName: string; faceImagePath?: string | null },
    cred?: { cardNumber?: string | null },
    existingId?: string,
    faceUrl?: string,
  ) {
    const cfg = this.parseConfig(device);
    const relay = cfg.relay ?? 1;
    const scheduleRelay = cfg.scheduleRelay?.trim() || `1001-${relay}`;
    return {
      ...(existingId ? { ID: existingId } : {}),
      UserID: user.employeeCode,
      Name: user.fullName,
      CardCode: cred?.cardNumber || '',
      FaceUrl: user.faceImagePath ? faceUrl || '' : '',
      PrivatePIN: '',
      WebRelay: '0',
      Building: '',
      LiftFloorNum: '',
      Room: '',
      ScheduleRelay: scheduleRelay,
    };
  }

  private async findModernUserId(device: Device, employeeCode: string) {
    const lookup = await this.request(
      device,
      `/api/user/get?NameOrPerID=${encodeURIComponent(employeeCode)}`,
      { method: 'GET' },
    );
    if (!this.isSuccessfulResponse(lookup)) return null;
    const data =
      lookup.data && typeof lookup.data === 'object' && !Array.isArray(lookup.data)
        ? (lookup.data as { data?: { item?: Array<Record<string, unknown>> } })
        : null;
    const items = Array.isArray(data?.data?.item) ? data?.data?.item : [];
    const existing = items.find((item) => {
      const userId = typeof item.UserID === 'string' ? item.UserID : String(item.UserID ?? '');
      return userId === employeeCode;
    });
    if (!existing) return null;
    const id = existing.ID;
    if (typeof id === 'string' && id.trim()) return id;
    if (typeof id === 'number') return String(id);
    return null;
  }

  private async syncUserToDevice(
    device: Device,
    user: { employeeCode: string; fullName: string; faceImagePath?: string | null },
    cred?: { cardNumber?: string | null },
  ) {
    const faceUrl = user.faceImagePath
      ? await this.storage.getFileUrlForDevice(user.faceImagePath, device.ipAddress)
      : undefined;
    const cfg = this.parseConfig(device);
    const modernEndpoint = '/api/user/add';
    const modernPayload = async () => {
      const existingId = await this.findModernUserId(device, user.employeeCode);
      const path = existingId ? '/api/user/set' : modernEndpoint;
      return {
        path,
        body: JSON.stringify({
          target: 'user',
          action: existingId ? 'set' : 'add',
          data: {
            item: [
              this.buildModernUserItem(
                device,
                user,
                cred,
                existingId ?? undefined,
                faceUrl,
              ),
            ],
          },
        }),
      };
    };

    const tryModern = async () => {
      const req = await modernPayload();
      const result = await this.request(device, req.path, {
        method: 'POST',
        body: req.body,
      });
      return result;
    };

    const tryLegacy = async () =>
      this.request(device, '/fcgi/do?action=AddUser', {
        method: 'POST',
        body: JSON.stringify(this.buildLegacyPayload(user, faceUrl)),
      });

    const preferLegacy = cfg.apiVersion === 'legacy';
    let result = preferLegacy ? await tryLegacy() : await tryModern();
    if (
      !this.isSuccessfulResponse(result) &&
      !preferLegacy &&
      (result.status === 404 || result.status === 400 || result.status === 405)
    ) {
      this.logger.warn(
        `Akuvox modern API failed for device=${device.code}, retrying legacy endpoint`,
      );
      result = await tryLegacy();
    }
    return result;
  }

  private async request(
    device: Device,
    path: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    if (this.mockMode) {
      this.logger.log(`[MOCK] ${init?.method || 'GET'} ${path} device=${device.code}`);
      return { ok: true, status: 200, data: { mock: true, path } };
    }

    const url = this.buildUrl(device, path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: this.authHeader(device),
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });
      let data: unknown = null;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { ok: res.ok, status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async openDoor(deviceId: string) {
    const device = await this.getAkuvoxDevice(deviceId);
    const cfg = this.parseConfig(device);
    const relay = cfg.relay ?? 1;

    const result = await this.request(
      device,
      `/fcgi/do?action=OpenDoor&DoorNum=${relay}`,
      { method: 'GET' },
    );

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        isOnline: result.ok,
        lastHeartbeat: new Date(),
      },
    });

    if (!result.ok) {
      throw new BadRequestException(`Open door failed (HTTP ${result.status})`);
    }

    return { ok: true, deviceId: device.id, relay, akuvox: result.data };
  }

  async syncCredentials(deviceId: string) {
    const device = await this.getAkuvoxDevice(deviceId);

    await this.prisma.device.update({
      where: { id: device.id },
      data: { syncStatus: DeviceSyncStatus.PENDING },
    });

    try {
      const zoneId = device.zoneId;
      if (!zoneId) {
        throw new BadRequestException(
          'Thiết bị chưa gắn khu vực — không đồng bộ credential',
        );
      }

      const permittedUserIds = await this.prisma.userAccessPermission.findMany({
        where: { zoneId, isDeleted: false },
        select: { userId: true },
      });
      const userIdSet = new Set(permittedUserIds.map((p) => p.userId));

      const credentials = await this.prisma.credential.findMany({
        where: {
          isDeleted: false,
          isActive: true,
          userId: { in: [...userIdSet] },
        },
        include: { user: true },
        take: 500,
      });

      let synced = 0;
      for (const cred of credentials) {
        if (!cred.user || cred.user.isDeleted) continue;
        const result = await this.syncUserToDevice(device, cred.user, cred);
        if (this.isSuccessfulResponse(result)) {
          synced += 1;
          await this.prisma.credential.update({
            where: { id: cred.id },
            data: { syncStatus: DeviceSyncStatus.SYNCED },
          });
        } else {
          this.logger.warn(
            `Credential sync failed user=${cred.user.employeeCode} device=${device.code} error=${this.buildErrorMessage(result)}`,
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

  /** Sync one user's active credentials to Akuvox in zones they are permitted to access. */
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
        deviceType: DeviceType.AKUVOX,
        isDeleted: false,
        zoneId: { in: targetZoneIds },
      },
      include: { zone: { select: { id: true, name: true } } },
    });

    const zoneNameById = new Map(
      permissions.map((p) => [p.zoneId, p.zone?.name ?? p.zoneId]),
    );

    if (this.mockMode) {
      for (const cred of user.credentials) {
        await this.prisma.credential.update({
          where: { id: cred.id },
          data: { syncStatus: DeviceSyncStatus.SYNCED },
        });
      }
      const results = devices.map((d) => ({
        deviceId: d.id,
        deviceName: d.name,
        zoneId: d.zoneId,
        zoneName: d.zoneId ? zoneNameById.get(d.zoneId) : undefined,
        ok: true,
      }));
      return {
        synced: Math.max(user.credentials.length, user.faceImagePath ? 1 : 0) * Math.max(devices.length, 1),
        devices: devices.length,
        results,
        mock: true,
      };
    }

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
          if (this.isSuccessfulResponse(result)) {
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
              error: this.buildErrorMessage(result),
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
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { synced, devices: devices.length, results };
  }

  /**
   * Remove a person from Akuvox panels in the given zones (or all panels if zoneIds empty → none).
   * Used when deleting a user or revoking zone access.
   */
  async removeUserFromZones(params: {
    employeeCode: string;
    zoneIds: string[];
  }) {
    const employeeCode = params.employeeCode.trim();
    if (!employeeCode || params.zoneIds.length === 0) {
      return { removed: 0, devices: 0, results: [] as Array<{
        deviceId: string;
        deviceName: string;
        zoneId: string | null;
        ok: boolean;
        error?: string;
        skipped?: boolean;
      }> };
    }

    const devices = await this.prisma.device.findMany({
      where: {
        deviceType: DeviceType.AKUVOX,
        isDeleted: false,
        zoneId: { in: params.zoneIds },
      },
    });

    const results: Array<{
      deviceId: string;
      deviceName: string;
      zoneId: string | null;
      ok: boolean;
      error?: string;
      skipped?: boolean;
    }> = [];
    let removed = 0;

    for (const device of devices) {
      try {
        const result = await this.removeUserFromDevice(device, employeeCode);
        if (result.skipped) {
          results.push({
            deviceId: device.id,
            deviceName: device.name,
            zoneId: device.zoneId,
            ok: true,
            skipped: true,
          });
          continue;
        }
        if (this.isSuccessfulResponse(result) || this.mockMode) {
          removed += 1;
          results.push({
            deviceId: device.id,
            deviceName: device.name,
            zoneId: device.zoneId,
            ok: true,
          });
        } else {
          results.push({
            deviceId: device.id,
            deviceName: device.name,
            zoneId: device.zoneId,
            ok: false,
            error: this.buildErrorMessage(result),
          });
        }
      } catch (err) {
        results.push({
          deviceId: device.id,
          deviceName: device.name,
          zoneId: device.zoneId,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { removed, devices: devices.length, results, mock: this.mockMode };
  }

  private async removeUserFromDevice(device: Device, employeeCode: string) {
    if (this.mockMode) {
      this.logger.log(`[MOCK] remove user=${employeeCode} device=${device.code}`);
      return { ok: true, status: 200, data: { mock: true }, skipped: false as const };
    }

    const cfg = this.parseConfig(device);
    const existingId = await this.findModernUserId(device, employeeCode);

    const tryModern = async () =>
      this.request(device, '/api/user/del', {
        method: 'POST',
        body: JSON.stringify({
          target: 'user',
          action: 'del',
          data: {
            item: [
              existingId
                ? { ID: existingId, UserID: employeeCode }
                : { UserID: employeeCode },
            ],
          },
        }),
      });

    const tryLegacy = async () =>
      this.request(
        device,
        `/fcgi/do?action=DelUser&UserID=${encodeURIComponent(employeeCode)}`,
        { method: 'GET' },
      );

    // Already absent on modern lookup — treat as success (idempotent).
    if (!existingId && cfg.apiVersion !== 'legacy') {
      const legacy = await tryLegacy();
      if (this.isSuccessfulResponse(legacy)) return { ...legacy, skipped: false as const };
      // Panel may not have the user; don't fail hard.
      this.logger.log(
        `Akuvox remove: user=${employeeCode} not found on device=${device.code} (treat as removed)`,
      );
      return { ok: true, status: 200, data: { skipped: true }, skipped: true as const };
    }

    const preferLegacy = cfg.apiVersion === 'legacy';
    let result = preferLegacy ? await tryLegacy() : await tryModern();
    if (
      !this.isSuccessfulResponse(result) &&
      !preferLegacy &&
      (result.status === 404 || result.status === 400 || result.status === 405)
    ) {
      this.logger.warn(
        `Akuvox modern delete failed device=${device.code}, retrying legacy DelUser`,
      );
      result = await tryLegacy();
    }
    return { ...result, skipped: false as const };
  }
}

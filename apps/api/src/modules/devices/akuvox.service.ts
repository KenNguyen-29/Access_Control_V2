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
};

@Injectable()
export class AkuvoxService {
  private readonly logger = new Logger(AkuvoxService.name);
  private readonly mockMode: boolean;
  private readonly defaultUsername: string;
  private readonly defaultPassword: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.mockMode = this.config.get<string>('AKUVOX_MOCK_MODE', 'true') === 'true';
    this.defaultUsername = this.config.get<string>('AKUVOX_DEFAULT_USERNAME', 'admin');
    this.defaultPassword = this.config.get<string>('AKUVOX_DEFAULT_PASSWORD', 'Admin123');
    this.timeoutMs = Number(this.config.get<string>('AKUVOX_REQUEST_TIMEOUT', '5000'));
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
    const username = cfg.username || this.defaultUsername;
    const password = cfg.password || this.defaultPassword;
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${token}`;
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
      const credentials = await this.prisma.credential.findMany({
        where: { isDeleted: false, isActive: true },
        include: { user: true },
        take: 500,
      });

      let synced = 0;
      for (const cred of credentials) {
        if (!cred.user || cred.user.isDeleted) continue;
        const payload = {
          UserID: cred.user.employeeCode,
          Name: cred.user.fullName,
          Card: cred.cardNumber || undefined,
          PrivateKey: cred.externalId || undefined,
          FaceURL: cred.user.faceImagePath
            ? this.storage.getFileUrl(cred.user.faceImagePath)
            : undefined,
        };

        const result = await this.request(device, '/fcgi/do?action=AddUser', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (result.ok) {
          synced += 1;
          await this.prisma.credential.update({
            where: { id: cred.id },
            data: { syncStatus: DeviceSyncStatus.SYNCED },
          });
        } else {
          this.logger.warn(
            `Credential sync failed user=${cred.user.employeeCode} status=${result.status}`,
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

  /** Sync one user's active credentials to Akuvox devices (optionally limited to a zone). */
  async syncUserCredentials(userId: string, zoneId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      include: { credentials: { where: { isDeleted: false, isActive: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const devices = await this.prisma.device.findMany({
      where: {
        deviceType: DeviceType.AKUVOX,
        isDeleted: false,
        ...(zoneId ? { zoneId } : {}),
      },
    });

    if (this.mockMode) {
      for (const cred of user.credentials) {
        await this.prisma.credential.update({
          where: { id: cred.id },
          data: { syncStatus: DeviceSyncStatus.SYNCED },
        });
      }
      return {
        synced: user.credentials.length * Math.max(devices.length, 1),
        devices: devices.length,
        mock: true,
      };
    }

    let synced = 0;
    const results: Array<{ deviceId: string; ok: boolean; error?: string }> = [];

    for (const device of devices) {
      try {
        for (const cred of user.credentials) {
          const payload = {
            UserID: user.employeeCode,
            Name: user.fullName,
            Card: cred.cardNumber || undefined,
            PrivateKey: cred.externalId || undefined,
            FaceURL: user.faceImagePath
              ? this.storage.getFileUrl(user.faceImagePath)
              : undefined,
          };
          const result = await this.request(device, '/fcgi/do?action=AddUser', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          if (result.ok) {
            synced += 1;
            await this.prisma.credential.update({
              where: { id: cred.id },
              data: { syncStatus: DeviceSyncStatus.SYNCED },
            });
          } else {
            results.push({ deviceId: device.id, ok: false, error: `HTTP ${result.status}` });
          }
        }
        results.push({ deviceId: device.id, ok: true });
      } catch (err) {
        results.push({
          deviceId: device.id,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { synced, devices: devices.length, results };
  }
}

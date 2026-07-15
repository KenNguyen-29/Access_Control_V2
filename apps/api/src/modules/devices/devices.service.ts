import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, DeviceType, Prisma } from '@prisma/client';
import { createConnection } from 'net';
import { PrismaService } from '../../prisma/prisma.service';
import { Go2RtcService } from './go2rtc.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

type AkuvoxConfig = {
  username?: string;
  password?: string;
  protocol?: 'http' | 'https';
  relay?: number;
  authMode?: 'basic';
};

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly go2rtc: Go2RtcService,
  ) {}

  /** Translate Prisma unique-constraint errors into a friendly 409 on the device code. */
  private rethrowKnownError(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : String(target ?? '');
      if (fields.includes('code')) {
        throw new ConflictException('Mã thiết bị đã tồn tại, vui lòng dùng mã khác');
      }
      throw new ConflictException(`Giá trị đã tồn tại: ${fields}`);
    }
    throw err;
  }

  /** Merge Akuvox credential/config fields (username/password/protocol/relay) into akuvoxConfig JSON. */
  private buildAkuvoxConfig(
    dto: CreateDeviceDto | UpdateDeviceDto,
    existing?: Prisma.JsonValue | null,
  ): AkuvoxConfig | undefined {
    const current: AkuvoxConfig =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as AkuvoxConfig) }
        : {};

    let touched = false;
    if (dto.username !== undefined) {
      current.username = dto.username.trim() || undefined;
      touched = true;
    }
    if (dto.password !== undefined && dto.password.trim()) {
      current.password = dto.password.trim();
      touched = true;
    }
    if (dto.protocol !== undefined) {
      current.protocol = dto.protocol;
      touched = true;
    }
    if (dto.relay !== undefined) {
      current.relay = dto.relay;
      touched = true;
    }
    if (!touched && existing === undefined) return undefined;
    return current;
  }

  /** Strip stored password from akuvoxConfig and expose akuvoxUsername for the client. */
  private sanitize(device: Device) {
    const cfg =
      device.akuvoxConfig && typeof device.akuvoxConfig === 'object' && !Array.isArray(device.akuvoxConfig)
        ? (device.akuvoxConfig as AkuvoxConfig)
        : {};
    const { password: _pw, ...safeConfig } = cfg;
    const { rtspPassword, ...safeDevice } = device;
    return {
      ...safeDevice,
      akuvoxConfig: safeConfig,
      akuvoxUsername: cfg.username ?? null,
      hasAkuvoxPassword: Boolean(cfg.password),
      hasRtspPassword: Boolean(rtspPassword),
    };
  }

  async findAll(query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      isDeleted: false,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.device.count({ where }),
    ]);

    return { items: items.map((d) => this.sanitize(d)), total, page, pageSize };
  }

  async findOne(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
    });
    if (!device) throw new NotFoundException('Device not found');
    return this.sanitize(device);
  }

  async create(dto: CreateDeviceDto) {
    const { username: _u, password: _p, protocol: _pr, relay: _r, ...rest } = dto;
    const akuvoxConfig = this.buildAkuvoxConfig(dto);
    let device: Device;
    try {
      device = await this.prisma.device.create({
        data: { ...rest, ...(akuvoxConfig ? { akuvoxConfig } : {}) },
      });
    } catch (err) {
      this.rethrowKnownError(err);
    }
    return this.sanitize(device);
  }

  async update(id: string, dto: UpdateDeviceDto) {
    const existing = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Device not found');

    const { username: _u, password: _p, protocol: _pr, relay: _r, ...rest } = dto;
    const hasAkuvoxFields =
      dto.username !== undefined ||
      dto.password !== undefined ||
      dto.protocol !== undefined ||
      dto.relay !== undefined;
    const akuvoxConfig = hasAkuvoxFields
      ? this.buildAkuvoxConfig(dto, existing.akuvoxConfig)
      : undefined;

    let device: Device;
    try {
      device = await this.prisma.device.update({
        where: { id },
        data: { ...rest, ...(akuvoxConfig ? { akuvoxConfig } : {}) },
      });
    } catch (err) {
      this.rethrowKnownError(err);
    }
    return this.sanitize(device);
  }

  async remove(id: string) {
    const device = await this.findOne(id);
    if (device.deviceType === DeviceType.CAMERA) {
      await this.go2rtc.removeStream(this.go2rtc.streamNameForDevice(device.id));
    }
    return this.prisma.device.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  /** Resolve the host/port to probe for reachability, based on device type. */
  private resolveHostPort(device: Device): { host: string; port: number } | null {
    if (device.deviceType === DeviceType.CAMERA) {
      const raw = (device.rtspUrl ?? '').trim();
      if (raw) {
        try {
          const url = new URL(raw.replace(/^rtsp:\/\//i, 'http://'));
          if (url.hostname) {
            return { host: url.hostname, port: url.port ? Number(url.port) : 554 };
          }
        } catch {
          // fall through to ipAddress
        }
      }
      if (device.ipAddress) return { host: device.ipAddress.trim(), port: 554 };
      return null;
    }

    // AKUVOX (or others): probe the HTTP(S) port on the device IP.
    if (!device.ipAddress) return null;
    const cfg =
      device.akuvoxConfig && typeof device.akuvoxConfig === 'object' && !Array.isArray(device.akuvoxConfig)
        ? (device.akuvoxConfig as AkuvoxConfig)
        : {};
    return { host: device.ipAddress.trim(), port: cfg.protocol === 'https' ? 443 : 80 };
  }

  /** Open a raw TCP connection to test reachability within a timeout. */
  private probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ host, port });
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  }

  async testConnection(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
    });
    if (!device) throw new NotFoundException('Device not found');

    const mockMode = this.config.get<string>('AKUVOX_MOCK_MODE', 'true') === 'true';
    const timeoutMs = Number(this.config.get<string>('DEVICE_PROBE_TIMEOUT', '4000'));
    const target = this.resolveHostPort(device);
    const startedAt = Date.now();

    let online: boolean;
    if (mockMode) {
      // Simulate a short probe; treat presence of a target as reachable.
      await new Promise((r) => setTimeout(r, 400));
      online = Boolean(target);
    } else if (!target) {
      online = false;
    } else {
      online = await this.probeTcp(target.host, target.port, timeoutMs);
    }

    const checkedAt = new Date();
    await this.prisma.device.update({
      where: { id: device.id },
      data: { isOnline: online, lastHeartbeat: online ? checkedAt : device.lastHeartbeat },
    });

    return {
      deviceId: device.id,
      online,
      host: target?.host ?? null,
      port: target?.port ?? null,
      latencyMs: Date.now() - startedAt,
      checkedAt: checkedAt.toISOString(),
      mock: mockMode,
    };
  }
}

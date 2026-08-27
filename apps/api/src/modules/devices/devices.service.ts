import { randomInt, randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CameraConnectionSource, Device, DeviceType, Prisma } from '@prisma/client';
import { createConnection } from 'net';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProjectScope } from '../../common/services/project-scope.service';
import { Go2RtcService } from './go2rtc.service';
import { DnakeService } from './dnake.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  buildRtspUrlWithCredentials,
  canonicalizeRtspUrl,
  redactRtspUrl,
} from './utils/rtsp-url.util';

type PanelConfig = {
  username?: string;
  password?: string;
  protocol?: 'http' | 'https';
  relay?: number;
  authMode?: 'basic';
  apiVersion?: 'modern' | 'legacy';
  scheduleRelay?: string;
  lastUnlockTs?: number;
};

const PANEL_CREDS_MSG =
  'Thiết bị chưa cấu hình tài khoản — nhập Username/Password trên trang Thiết bị';

function isPanelType(type: DeviceType) {
  return type === DeviceType.AKUVOX || type === DeviceType.DNAKE;
}

@Injectable()
export class DevicesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly go2rtc: Go2RtcService,
    private readonly dnake: DnakeService,
  ) {}

  /** Register camera sources up front so go2rtc has a visible stream before the first viewer. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const cameras = await this.prisma.device.findMany({
        where: { deviceType: DeviceType.CAMERA, isDeleted: false, rtspUrl: { not: null } },
        select: { id: true, code: true, rtspUrl: true, rtspUsername: true, rtspPassword: true },
      });
      await Promise.all(
        cameras.map((camera) =>
          this.prewarmCameraStream(camera).catch((error) => {
            this.logger.debug(
              `Camera stream prewarm skipped ${camera.code}: ${this.safeError(error)}`,
            );
          }),
        ),
      );
    } catch (error) {
      this.logger.debug(`Camera stream prewarm unavailable: ${this.safeError(error)}`);
    }
  }

  private async prewarmCameraStream(device: {
    id: string;
    code: string;
    rtspUrl: string | null;
    rtspUsername: string | null;
    rtspPassword: string | null;
  }): Promise<void> {
    if (!device.rtspUrl?.trim() || !this.go2rtc.isEnabled()) return;
    await this.go2rtc.upsertStream(
      this.go2rtc.streamNameForDevice(device.id),
      buildRtspUrlWithCredentials(device.rtspUrl, device.rtspUsername, device.rtspPassword),
    );
  }

  private scheduleCameraPrewarm(device: Device): void {
    if (device.deviceType !== DeviceType.CAMERA) return;
    void this.prewarmCameraStream(device).catch((error) => {
      this.logger.debug(`Camera stream prewarm skipped ${device.code}: ${this.safeError(error)}`);
    });
  }

  private safeError(error: unknown): string {
    return error instanceof Error
      ? error.message.replace(/rtsps?:\/\/[^@\s]+@/gi, 'rtsp://***@')
      : 'Unknown error';
  }

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

  private parsePanelConfig(raw: Prisma.JsonValue | null | undefined): PanelConfig {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return { ...(raw as PanelConfig) };
    }
    return {};
  }

  private assertPanelCredentials(deviceType: DeviceType, cfg: PanelConfig, isCreate: boolean) {
    if (!isPanelType(deviceType)) return;
    const username = cfg.username?.trim();
    const password = cfg.password?.trim();
    if (!username) {
      throw new BadRequestException('Vui lòng nhập Username thiết bị');
    }
    if (!password) {
      throw new BadRequestException(isCreate ? 'Vui lòng nhập Password thiết bị' : PANEL_CREDS_MSG);
    }
  }

  /** Akuvox panels behind the same NAT must not share IP — door_log falls back to client IP. */
  private async assertUniqueAkuvoxIp(params: {
    deviceType: DeviceType;
    ipAddress?: string | null;
    excludeDeviceId?: string;
  }) {
    if (params.deviceType !== DeviceType.AKUVOX) return;
    const ip = params.ipAddress?.trim();
    if (!ip) return;

    const other = await this.prisma.device.findFirst({
      where: {
        isDeleted: false,
        deviceType: DeviceType.AKUVOX,
        ipAddress: ip,
        ...(params.excludeDeviceId ? { id: { not: params.excludeDeviceId } } : {}),
      },
      select: { name: true, code: true },
    });
    if (other) {
      throw new BadRequestException(
        `IP ${ip} đã dùng cho máy Akuvox ${other.name} (${other.code}). ` +
          `Hai máy cùng NAT cần mã thiết bị trên Action URL webhook (deviceCode), không dùng chung IP.`,
      );
    }
  }

  /** Attendance panels: exactly one zone, and that zone cannot already have another panel of the same type. */
  private async assertAttendanceZoneAssignment(params: {
    deviceType: DeviceType;
    zoneId?: string | null;
    excludeDeviceId?: string;
  }) {
    if (!isPanelType(params.deviceType)) return;
    const zoneId = params.zoneId?.trim();
    if (!zoneId) {
      throw new BadRequestException('Vui lòng chọn khu vực cho thiết bị chấm công');
    }

    const zone = await this.prisma.accessZone.findFirst({
      where: { id: zoneId, isDeleted: false },
      select: { id: true, name: true },
    });
    if (!zone) {
      throw new BadRequestException('Khu vực không tồn tại');
    }

    const other = await this.prisma.device.findFirst({
      where: {
        isDeleted: false,
        deviceType: params.deviceType,
        zoneId,
        ...(params.excludeDeviceId ? { id: { not: params.excludeDeviceId } } : {}),
      },
      select: { name: true, code: true },
    });
    if (other) {
      throw new ConflictException(
        `Khu vực "${zone.name}" đã có thiết bị ${params.deviceType} (${other.name}). Mỗi máy chấm công chỉ gắn 1 khu vực, mỗi khu vực chỉ 1 máy ${params.deviceType}.`,
      );
    }
  }

  /** Merge username/password/protocol/relay into panel JSON config. */
  private buildPanelConfig(
    dto: CreateDeviceDto | UpdateDeviceDto,
    existing?: Prisma.JsonValue | null,
  ): PanelConfig | undefined {
    const current: PanelConfig =
      existing !== undefined ? this.parsePanelConfig(existing) : {};

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

  /** Strip stored passwords from panel configs for API responses. */
  private sanitize(device: Device) {
    const akuvoxCfg = this.parsePanelConfig(device.akuvoxConfig);
    const dnakeCfg = this.parsePanelConfig(device.dnakeConfig);
    const { password: _a, ...safeAkuvox } = akuvoxCfg;
    const { password: _d, lastUnlockTs: _ts, ...safeDnake } = dnakeCfg;
    const { rtspPassword, ...safeDevice } = device;
    return {
      ...safeDevice,
      akuvoxConfig: safeAkuvox,
      dnakeConfig: safeDnake,
      akuvoxUsername: akuvoxCfg.username ?? null,
      hasAkuvoxPassword: Boolean(akuvoxCfg.password),
      dnakeUsername: dnakeCfg.username ?? null,
      hasDnakePassword: Boolean(dnakeCfg.password),
      hasRtspPassword: Boolean(rtspPassword),
    };
  }

  private projectScopeWhere(scope: ProjectScope): Prisma.DeviceWhereInput {
    if (scope === null) return {};
    return { projectId: { in: scope } };
  }

  private assertDeviceInScope(projectId: string | null | undefined, scope: ProjectScope) {
    if (scope === null) return;
    if (!projectId || !scope.includes(projectId)) {
      throw new ForbiddenException('Thiết bị ngoài phạm vi dự án được phép');
    }
  }

  private async assertProjectExists(projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException('Dự án không tồn tại');
    }
  }

  private buildCameraData(
    dto: CreateDeviceDto | UpdateDeviceDto,
    ipAddress: string,
    existing?: Device,
  ) {
    const rtspUrl = dto.rtspUrl !== undefined ? dto.rtspUrl : existing?.rtspUrl;
    if (!rtspUrl?.trim()) {
      throw new BadRequestException('Vui lòng nhập RTSP URL cho camera');
    }
    let cleanRtspUrl: string;
    let embeddedUsername = '';
    let embeddedPassword = '';
    try {
      const normalized = canonicalizeRtspUrl(rtspUrl);
      if (normalized.hostname !== ipAddress.trim()) {
        throw new BadRequestException('RTSP URL phải trỏ đúng IP camera');
      }
      cleanRtspUrl = normalized.cleanUrl;
      embeddedUsername = normalized.username;
      embeddedPassword = normalized.password;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'RTSP URL không hợp lệ',
      );
    }

    const hasOnvifInput =
      dto.onvifServiceUrl !== undefined || dto.onvifProfileToken !== undefined;
    const source =
      dto.connectionSource ??
      (hasOnvifInput ? CameraConnectionSource.ONVIF : existing?.connectionSource) ??
      CameraConnectionSource.MANUAL;
    const rtspUsername = dto.rtspUsername ?? existing?.rtspUsername ?? embeddedUsername;
    const rtspPassword = dto.rtspPassword ?? existing?.rtspPassword ?? embeddedPassword;
    if (source === CameraConnectionSource.MANUAL) {
      return {
        rtspUrl: cleanRtspUrl,
        rtspUsername: rtspUsername || undefined,
        rtspPassword: rtspPassword || undefined,
        connectionSource: CameraConnectionSource.MANUAL,
        onvifServiceUrl: null,
        onvifProfileToken: null,
        onvifPort: null,
        manufacturer: null,
        model: null,
        lastConnectionError: null,
      };
    }

    const serviceUrl = (dto.onvifServiceUrl ?? existing?.onvifServiceUrl ?? '').trim();
    const profileToken = (dto.onvifProfileToken ?? existing?.onvifProfileToken ?? '').trim();
    if (!serviceUrl || !profileToken) {
      throw new BadRequestException(
        'Camera ONVIF phải có service URL và profile token. Hãy lấy profile trước khi lưu.',
      );
    }
    try {
      const parsed = new URL(serviceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname !== ipAddress.trim()) {
        throw new Error('host mismatch');
      }
    } catch {
      throw new BadRequestException('ONVIF service URL phải trỏ đúng IP camera');
    }
    const parsedPort = (() => {
      try {
        const port = new URL(serviceUrl).port;
        return port ? Number(port) : 80;
      } catch {
        return 80;
      }
    })();
    const onvifPort = dto.onvifPort ?? existing?.onvifPort ?? parsedPort;
    if (!Number.isInteger(onvifPort) || onvifPort < 1 || onvifPort > 65535) {
      throw new BadRequestException('Cổng ONVIF không hợp lệ');
    }
    return {
      rtspUrl: cleanRtspUrl,
      rtspUsername: rtspUsername || undefined,
      rtspPassword: rtspPassword || undefined,
      connectionSource: CameraConnectionSource.ONVIF,
      onvifServiceUrl: serviceUrl,
      onvifProfileToken: profileToken,
      onvifPort,
      manufacturer: dto.manufacturer?.trim() || existing?.manufacturer || null,
      model: dto.model?.trim() || existing?.model || null,
      lastConnectionError: null,
    };
  }

  /** Persist ONVIF metadata for Akuvox/DNAKE too; their username/password are stored in panelConfig. */
  private buildPanelOnvifData(
    dto: CreateDeviceDto | UpdateDeviceDto,
    ipAddress: string,
    existing?: Device,
  ) {
    const hasOnvifInput =
      dto.onvifServiceUrl !== undefined || dto.onvifProfileToken !== undefined;
    const source =
      dto.connectionSource ??
      (hasOnvifInput ? CameraConnectionSource.ONVIF : existing?.connectionSource) ??
      CameraConnectionSource.MANUAL;
    const rtspUrl = dto.rtspUrl !== undefined ? dto.rtspUrl : existing?.rtspUrl;
    const trimmedRtspUrl = typeof rtspUrl === 'string' ? rtspUrl.trim() : '';

    if (source === CameraConnectionSource.MANUAL) {
      return {
        ...(rtspUrl !== undefined ? { rtspUrl: trimmedRtspUrl || null } : {}),
        connectionSource: CameraConnectionSource.MANUAL,
        onvifServiceUrl: null,
        onvifProfileToken: null,
        onvifPort: null,
        manufacturer: null,
        model: null,
        lastConnectionError: null,
      };
    }

    const serviceUrl = (dto.onvifServiceUrl ?? existing?.onvifServiceUrl ?? '').trim();
    const profileToken = (dto.onvifProfileToken ?? existing?.onvifProfileToken ?? '').trim();
    if (!serviceUrl || !profileToken) {
      throw new BadRequestException(
        'Thiết bị ONVIF phải có service URL và profile token. Hãy lấy profile trước khi lưu.',
      );
    }
    try {
      const parsed = new URL(serviceUrl);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.hostname !== ipAddress.trim() ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error('host mismatch');
      }
    } catch {
      throw new BadRequestException('ONVIF service URL phải trỏ đúng IP thiết bị');
    }

    let normalizedRtsp: string | null = rtspUrl?.trim() || null;
    if (normalizedRtsp) {
      try {
        const parsed = canonicalizeRtspUrl(normalizedRtsp);
        if (parsed.hostname !== ipAddress.trim()) {
          throw new BadRequestException('RTSP URL phải trỏ đúng IP thiết bị');
        }
        normalizedRtsp = parsed.cleanUrl;
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException(
          error instanceof Error ? error.message : 'RTSP URL không hợp lệ',
        );
      }
    }
    const parsedPort = (() => {
      try {
        const port = new URL(serviceUrl).port;
        return port ? Number(port) : 80;
      } catch {
        return 80;
      }
    })();
    const onvifPort = dto.onvifPort ?? existing?.onvifPort ?? parsedPort;
    if (!Number.isInteger(onvifPort) || onvifPort < 1 || onvifPort > 65535) {
      throw new BadRequestException('Cổng ONVIF không hợp lệ');
    }
    return {
      rtspUrl: normalizedRtsp,
      connectionSource: CameraConnectionSource.ONVIF,
      onvifServiceUrl: serviceUrl,
      onvifProfileToken: profileToken,
      onvifPort,
      manufacturer: dto.manufacturer?.trim() || existing?.manufacturer || null,
      model: dto.model?.trim() || existing?.model || null,
      lastConnectionError: null,
    };
  }

  async findAll(
    query: PaginationDto & { zoneId?: string; deviceType?: DeviceType; projectId?: string },
    scope: ProjectScope = null,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();

    let requestedProjectFilter: Prisma.DeviceWhereInput = {};
    if (query.projectId) {
      if (scope !== null && !scope.includes(query.projectId)) {
        throw new ForbiddenException('Dự án ngoài phạm vi được phép');
      }
      requestedProjectFilter = { projectId: query.projectId };
    } else {
      requestedProjectFilter = this.projectScopeWhere(scope);
    }

    const where: Prisma.DeviceWhereInput = {
      isDeleted: false,
      ...requestedProjectFilter,
      ...(query.zoneId ? { zoneId: query.zoneId } : {}),
      ...(query.deviceType ? { deviceType: query.deviceType } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
              { ipAddress: { contains: search, mode: 'insensitive' as const } },
              { location: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        include: {
          zone: { select: { id: true, name: true } },
          project: { select: { id: true, name: true, code: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.device.count({ where }),
    ]);

    return {
      items: items.map((d) => {
        const sanitized = this.sanitize(d);
        return {
          ...sanitized,
          zone: d.zone ? { id: d.zone.id, name: d.zone.name } : null,
          project: d.project
            ? { id: d.project.id, name: d.project.name, code: d.project.code }
            : null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string, scope: ProjectScope = null) {
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
      include: {
        zone: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    this.assertDeviceInScope(device.projectId, scope);
    const sanitized = this.sanitize(device);
    return {
      ...sanitized,
      zone: device.zone ? { id: device.zone.id, name: device.zone.name } : null,
      project: device.project
        ? { id: device.project.id, name: device.project.name, code: device.project.code }
        : null,
    };
  }

  /** Ensure device exists and is in project scope (WebRTC / open-door / sync). */
  async assertAccessible(id: string, scope: ProjectScope) {
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, projectId: true, deviceType: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    this.assertDeviceInScope(device.projectId, scope);
    return device;
  }

  private nextDeviceCode(deviceType: DeviceType) {
    const prefix =
      deviceType === DeviceType.DNAKE ? 'DNA' : deviceType === DeviceType.CAMERA ? 'CAM' : 'AKU';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 4; i += 1) {
      suffix += alphabet[randomInt(alphabet.length)];
    }
    return `${prefix}${suffix}`;
  }

  async create(dto: CreateDeviceDto, scope: ProjectScope = null) {
    const {
      username: _u,
      password: _p,
      protocol: _pr,
      relay: _r,
      code: dtoCode,
      rtspUrl: _rtspUrl,
      connectionSource: _connectionSource,
      onvifServiceUrl: _onvifServiceUrl,
      onvifProfileToken: _onvifProfileToken,
      onvifPort: _onvifPort,
      manufacturer: _manufacturer,
      model: _model,
      ...rest
    } = dto;
    const panelConfig = this.buildPanelConfig(dto);
    if (isPanelType(dto.deviceType)) {
      this.assertPanelCredentials(dto.deviceType, panelConfig ?? {}, true);
      await this.assertAttendanceZoneAssignment({
        deviceType: dto.deviceType,
        zoneId: dto.zoneId,
      });
      await this.assertUniqueAkuvoxIp({
        deviceType: dto.deviceType,
        ipAddress: dto.ipAddress,
      });
    }

    if (dto.deviceType === DeviceType.CAMERA && !dto.projectId?.trim()) {
      throw new BadRequestException('Vui lòng chọn dự án cho camera');
    }
    if (dto.projectId) {
      await this.assertProjectExists(dto.projectId);
      this.assertDeviceInScope(dto.projectId, scope);
    }

    const connectionData =
      dto.deviceType === DeviceType.CAMERA
        ? this.buildCameraData(dto, dto.ipAddress)
        : this.buildPanelOnvifData(dto, dto.ipAddress);

    const providedCode = dtoCode?.trim();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const data: Prisma.DeviceUncheckedCreateInput = {
        ...rest,
        code: providedCode || this.nextDeviceCode(dto.deviceType),
        ...connectionData,
        ...(dto.deviceType === DeviceType.AKUVOX && panelConfig ? { akuvoxConfig: panelConfig } : {}),
        ...(dto.deviceType === DeviceType.DNAKE && panelConfig ? { dnakeConfig: panelConfig } : {}),
      };

      try {
        const device = await this.prisma.device.create({ data });
        this.scheduleCameraPrewarm(device);
        return this.sanitize(device);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          !providedCode
        ) {
          const target = err.meta?.target;
          const fields = Array.isArray(target) ? target.join(', ') : String(target ?? '');
          if (fields.includes('code')) continue;
        }
        this.rethrowKnownError(err);
      }
    }
    throw new ConflictException('Không thể tự sinh mã thiết bị, vui lòng thử lại');
  }

  async update(id: string, dto: UpdateDeviceDto, scope: ProjectScope = null) {
    const existing = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new NotFoundException('Device not found');
    this.assertDeviceInScope(existing.projectId, scope);

    const {
      username: _u,
      password: _p,
      protocol: _pr,
      relay: _r,
      code: _code,
      rtspUrl: _rtspUrl,
      connectionSource: _connectionSource,
      onvifServiceUrl: _onvifServiceUrl,
      onvifProfileToken: _onvifProfileToken,
      onvifPort: _onvifPort,
      manufacturer: _manufacturer,
      model: _model,
      ...rest
    } = dto;
    const hasPanelFields =
      dto.username !== undefined ||
      dto.password !== undefined ||
      dto.protocol !== undefined ||
      dto.relay !== undefined;

    const nextType = dto.deviceType ?? existing.deviceType;
    const nextIp = dto.ipAddress !== undefined ? dto.ipAddress : existing.ipAddress;
    const existingPanel =
      nextType === DeviceType.DNAKE ? existing.dnakeConfig : existing.akuvoxConfig;
    const panelConfig = hasPanelFields
      ? this.buildPanelConfig(dto, existingPanel)
      : this.parsePanelConfig(existingPanel);

    if (isPanelType(nextType)) {
      this.assertPanelCredentials(nextType, panelConfig ?? {}, false);
      const nextZoneId = dto.zoneId !== undefined ? dto.zoneId : existing.zoneId;
      await this.assertAttendanceZoneAssignment({
        deviceType: nextType,
        zoneId: nextZoneId,
        excludeDeviceId: id,
      });
      await this.assertUniqueAkuvoxIp({
        deviceType: nextType,
        ipAddress: nextIp,
        excludeDeviceId: id,
      });
    }

    const nextProjectId = dto.projectId !== undefined ? dto.projectId : existing.projectId;
    if (nextType === DeviceType.CAMERA && !nextProjectId?.trim()) {
      throw new BadRequestException('Vui lòng chọn dự án cho camera');
    }
    if (dto.projectId) {
      await this.assertProjectExists(dto.projectId);
      this.assertDeviceInScope(dto.projectId, scope);
    }

    const connectionData =
      nextType === DeviceType.CAMERA
        ? this.buildCameraData(dto, nextIp ?? '', existing)
        : existing.deviceType === DeviceType.CAMERA
          ? {
              rtspUrl: null,
              rtspUsername: null,
              rtspPassword: null,
              connectionSource: null,
              onvifServiceUrl: null,
              onvifProfileToken: null,
              onvifPort: null,
              manufacturer: null,
              model: null,
              lastConnectionError: null,
            }
          : this.buildPanelOnvifData(
              dto,
              nextIp ?? '',
              existing.deviceType === nextType ? existing : undefined,
            );

    const data: Prisma.DeviceUncheckedUpdateInput = {
      ...rest,
      ...connectionData,
      ...(hasPanelFields && panelConfig && nextType === DeviceType.DNAKE
        ? { dnakeConfig: panelConfig }
        : {}),
      ...(hasPanelFields && panelConfig && nextType === DeviceType.AKUVOX
        ? { akuvoxConfig: panelConfig }
        : {}),
    };

    let device: Device;
    try {
      device = await this.prisma.device.update({ where: { id }, data });
    } catch (err) {
      this.rethrowKnownError(err);
    }
    this.scheduleCameraPrewarm(device);
    return this.sanitize(device);
  }

  async remove(id: string, scope: ProjectScope = null) {
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
    });
    if (!device) throw new NotFoundException('Device not found');
    this.assertDeviceInScope(device.projectId, scope);

    if (device.deviceType === DeviceType.CAMERA) {
      await this.go2rtc.removeStream(this.go2rtc.streamNameForDevice(device.id));
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.deviceCameraMapping.deleteMany({
        where: {
          OR: [{ akuvoxDeviceId: id }, { cameraDeviceId: id }],
        },
      });
      await tx.userDevicePermission.deleteMany({ where: { deviceId: id } });
      // Giữ AccessLog giám sát, chỉ bỏ liên kết thiết bị
      await tx.accessLog.updateMany({
        where: { deviceId: id },
        data: { deviceId: null },
      });
      await tx.device.delete({ where: { id } });
    });

    return { id, code: device.code, name: device.name };
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

    if (!device.ipAddress) return null;
    const cfg =
      device.deviceType === DeviceType.DNAKE
        ? this.parsePanelConfig(device.dnakeConfig)
        : this.parsePanelConfig(device.akuvoxConfig);
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

  private buildAkuvoxUrl(device: Device, path: string) {
    const cfg = this.parsePanelConfig(device.akuvoxConfig);
    const protocol = cfg.protocol || 'http';
    return `${protocol}://${device.ipAddress}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private buildAkuvoxAuthHeader(device: Device) {
    const cfg = this.parsePanelConfig(device.akuvoxConfig);
    const username = cfg.username?.trim();
    const password = cfg.password?.trim();
    if (!username || !password) {
      throw new BadRequestException(PANEL_CREDS_MSG);
    }
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  /** Probe an unsaved ONVIF stream through a temporary go2rtc source. */
  async testOnvifStream(input: {
    ipAddress: string;
    rtspUrl: string;
    username?: string;
    password?: string;
    timeoutMs?: number;
  }) {
    const ipAddress = input.ipAddress.trim();
    let cleanUrl: string;
    try {
      const normalized = canonicalizeRtspUrl(input.rtspUrl);
      if (normalized.hostname !== ipAddress) {
        throw new BadRequestException('RTSP URL phải trỏ đúng IP camera đã chọn');
      }
      cleanUrl = normalized.cleanUrl;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'RTSP URL không hợp lệ',
      );
    }

    const username = input.username?.trim() || '';
    const password = input.password || '';
    if (username.length > 256 || password.length > 256) {
      throw new BadRequestException('Thông tin xác thực RTSP quá dài');
    }

    const timeoutMs = Math.min(15000, Math.max(1000, Math.round(Number(input.timeoutMs) || 7000)));
    const streamName = `onvif_probe_${randomUUID().replace(/-/g, '')}`;
    const startedAt = Date.now();
    try {
      await this.go2rtc.upsertStream(
        streamName,
        buildRtspUrlWithCredentials(cleanUrl, username, password),
      );
      await this.go2rtc.probeStream(streamName, timeoutMs);
      return {
        online: true,
        rtspUrl: cleanUrl,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: 'Đọc frame RTSP thành công',
      };
    } catch {
      return {
        online: false,
        rtspUrl: redactRtspUrl(cleanUrl),
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: 'Không đọc được luồng RTSP. Kiểm tra URL, credential và kết nối camera.',
      };
    } finally {
      await this.go2rtc.removeStream(streamName);
    }
  }

  async testConnection(id: string) {
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
    });
    if (!device) throw new NotFoundException('Device not found');

    if (device.deviceType === DeviceType.DNAKE) {
      const startedAt = Date.now();
      try {
        const result = await this.dnake.testConnection(id);
        const target = this.resolveHostPort(device);
        return {
          deviceId: device.id,
          online: Boolean(result.ok),
          host: target?.host ?? null,
          port: target?.port ?? null,
          latencyMs: Date.now() - startedAt,
          checkedAt: new Date().toISOString(),
          mock: Boolean(result.mock),
          detail: result.ok ? 'DNAKE API OK' : 'DNAKE login/info failed',
        };
      } catch (err) {
        const target = this.resolveHostPort(device);
        return {
          deviceId: device.id,
          online: false,
          host: target?.host ?? null,
          port: target?.port ?? null,
          latencyMs: Date.now() - startedAt,
          checkedAt: new Date().toISOString(),
          mock: false,
          detail: err instanceof Error ? err.message : 'DNAKE unreachable',
        };
      }
    }

    const mockMode = this.config.get<string>('AKUVOX_MOCK_MODE', 'true') === 'true';
    const timeoutMs = Number(this.config.get<string>('DEVICE_PROBE_TIMEOUT', '4000'));
    const target = this.resolveHostPort(device);
    const startedAt = Date.now();

    let online: boolean;
    let detail: string | null = null;
    if (mockMode && device.deviceType === DeviceType.AKUVOX) {
      await new Promise((r) => setTimeout(r, 400));
      online = Boolean(target);
    } else if (!target) {
      online = false;
      detail = 'Thiết bị chưa có địa chỉ kết nối';
    } else if (device.deviceType === DeviceType.AKUVOX) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(this.buildAkuvoxUrl(device, '/api/user/get?page=1'), {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Authorization: this.buildAkuvoxAuthHeader(device),
            Accept: 'application/json',
          },
        });
        clearTimeout(timer);
        const text = await res.text();
        online = res.ok;
        detail = online ? 'HTTP API OK' : text || `HTTP ${res.status}`;
      } catch (err) {
        online = false;
        detail = err instanceof Error ? err.message : 'HTTP API unreachable';
      }
    } else if (mockMode) {
      await new Promise((r) => setTimeout(r, 400));
      online = Boolean(target);
    } else {
      online = await this.probeTcp(target.host, target.port, timeoutMs);
    }

    const checkedAt = new Date();
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        isOnline: online,
        lastHeartbeat: online ? checkedAt : device.lastHeartbeat,
        lastConnectionError: online ? null : detail,
      },
    });

    return {
      deviceId: device.id,
      online,
      host: target?.host ?? null,
      port: target?.port ?? null,
      latencyMs: Date.now() - startedAt,
      checkedAt: checkedAt.toISOString(),
      mock: mockMode,
      detail,
    };
  }
}

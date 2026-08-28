import { Injectable, Logger } from '@nestjs/common';
import { AccessAction as PrismaAccessAction, DeviceType, PresenceStatus } from '@prisma/client';
import { AccessAction, AkuvoxWebhookJobData, CheckinEvent } from '@acv2/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EventsGateway } from '../events/events.gateway';
import { RealtimeMetricsService } from '../events/realtime-metrics.service';
import { AttendanceService, PunchResult } from '../attendance/attendance.service';
import {
  AkuvoxDoorLogPayload,
  buildDoorLogEventTime,
  buildDoorLogSourceEventId,
  isDoorLogSuccess,
  normalizedDoorLogUserId,
} from '../webhooks/akuvox-door-log.util';
import { SnapshotCaptureService } from './snapshot-capture.service';

/** Suppress repeat face scans for the same person+device (no AccessLog / socket / punch). */
const FACE_SCAN_COOLDOWN_MS = 5 * 60 * 1000;

@Injectable()
export class AkuvoxEventService {
  private readonly logger = new Logger(AkuvoxEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly eventsGateway: EventsGateway,
    private readonly attendance: AttendanceService,
    private readonly metrics: RealtimeMetricsService,
    private readonly snapshots: SnapshotCaptureService,
  ) {}

  private async upsertPresence(
    userId: string,
    action: PrismaAccessAction,
    zoneId: string | null | undefined,
    eventAt: Date,
  ) {
    const status =
      action === PrismaAccessAction.CHECK_OUT
        ? PresenceStatus.CHECK_OUT
        : PresenceStatus.CHECK_IN;
    await this.prisma.userPresence.upsert({
      where: { userId },
      create: {
        userId,
        currentStatus: status,
        currentZoneId: zoneId ?? null,
        lastEventTime: eventAt,
      },
      update: {
        currentStatus: status,
        currentZoneId: zoneId ?? null,
        lastEventTime: eventAt,
      },
    });
  }

  private toPrismaAction(punch: PunchResult): PrismaAccessAction {
    if (punch.outcome === 'CHECK_OUT') return PrismaAccessAction.CHECK_OUT;
    if (punch.outcome === 'CHECK_IN') return PrismaAccessAction.CHECK_IN;
    return PrismaAccessAction.UNKNOWN;
  }

  private toSocketAction(action: PrismaAccessAction): AccessAction {
    if (action === PrismaAccessAction.CHECK_OUT) return AccessAction.CHECK_OUT;
    if (action === PrismaAccessAction.CHECK_IN) return AccessAction.CHECK_IN;
    if (action === PrismaAccessAction.DENIED) return AccessAction.UNKNOWN;
    return AccessAction.UNKNOWN;
  }

  private async findDevice(params: {
    deviceCode?: string;
    deviceIp?: string;
    clientIp?: string;
  }) {
    const deviceCode = params.deviceCode;
    const deviceIp = params.deviceIp?.trim();
    const clientIp = params.clientIp?.trim();

    if (deviceCode) {
      const byCode = await this.prisma.device.findFirst({
        where: { code: String(deviceCode), isDeleted: false, deviceType: DeviceType.AKUVOX },
      });
      if (byCode) return byCode;
    }

    for (const ip of [deviceIp, clientIp]) {
      if (!ip) continue;
      const byIp = await this.prisma.device.findFirst({
        where: { ipAddress: ip, isDeleted: false, deviceType: DeviceType.AKUVOX },
      });
      if (byIp) return byIp;
    }

    return null;
  }

  private async findUserByEmployeeCode(employeeCode?: string) {
    return this.findUserByIdentity(employeeCode);
  }

  /** Match by employeeCode first, then fullName (DNAKE unlock logs often have name only). */
  private async findUserByIdentity(identifier?: string) {
    const key = identifier?.trim();
    if (!key || key.toLowerCase() === 'none') return null;

    const byCode = await this.prisma.user.findFirst({
      where: {
        employeeCode: { equals: key, mode: 'insensitive' },
        isDeleted: false,
      },
      include: { department: true },
    });
    if (byCode) return byCode;

    return this.prisma.user.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { fullName: { equals: key, mode: 'insensitive' } },
          { fullName: { contains: key, mode: 'insensitive' } },
        ],
      },
      include: { department: true },
    });
  }

  /** Upload snapshot in background, then patch AccessLog + re-emit with snapshotUrl. */
  private finalizeSnapshotAsync(
    accessLogId: string,
    snapshotPath: string,
    buffer: Buffer,
    baseEvent: CheckinEvent,
  ) {
    void (async () => {
      try {
        await this.storage.uploadFile(snapshotPath, buffer, 'image/jpeg');
        await this.prisma.accessLog.update({
          where: { id: accessLogId },
          data: { snapshotPath },
        });
        const snapshotUrl = await this.storage
          .getAssetUrl(snapshotPath, { forBrowser: true })
          .catch(() => this.storage.getSignedUrl(snapshotPath).catch(() => undefined));
        this.eventsGateway.emitCheckinEvent({
          ...baseEvent,
          snapshotUrl,
        });
      } catch (err) {
        this.logger.warn(
          `Async snapshot finalize failed for accessLog=${accessLogId}: ${(err as Error).message}`,
        );
      }
    })();
  }

  /** Prefer webhook image; otherwise capture JPEG from panel RTSP (go2rtc). */
  private scheduleSnapshot(
    accessLogId: string,
    deviceId: string,
    baseEvent: CheckinEvent,
    eventAt: Date,
    pendingSnapshot?: { path: string; buffer: Buffer },
  ) {
    if (pendingSnapshot) {
      this.finalizeSnapshotAsync(
        accessLogId,
        pendingSnapshot.path,
        pendingSnapshot.buffer,
        baseEvent,
      );
      return;
    }
    void (async () => {
      const captured = await this.snapshots.captureForReaderDevice(deviceId, eventAt);
      if (!captured) return;
      this.finalizeSnapshotAsync(accessLogId, captured.path, captured.buffer, baseEvent);
    })();
  }

  /**
   * Zone gate: no zones assigned → no punch.
   * Zones assigned but device zone not in set → invalid, no punch.
   */
  private async resolveZonePunchGate(params: {
    userId: string;
    deviceZoneId: string | null;
  }): Promise<{ allowPunch: boolean; warning?: string }> {
    const permissions = await this.prisma.userAccessPermission.findMany({
      where: { userId: params.userId, isDeleted: false },
      select: { zoneId: true },
    });
    if (permissions.length === 0) {
      return {
        allowPunch: false,
        warning: 'Chưa gán khu vực — không tính chấm công',
      };
    }
    if (!params.deviceZoneId) {
      return {
        allowPunch: false,
        warning: 'Thiết bị chưa gắn khu vực — không tính chấm công',
      };
    }
    const allowed = new Set(permissions.map((p) => p.zoneId));
    if (!allowed.has(params.deviceZoneId)) {
      return {
        allowPunch: false,
        warning: 'Không có quyền khu vực thiết bị này — không tính chấm công',
      };
    }
    return { allowPunch: true };
  }

  async processDoorLog(
    dto: AkuvoxDoorLogPayload,
    clientIp: string,
    deviceCode?: string,
  ) {
    const employeeCode = normalizedDoorLogUserId(dto);
    if (!employeeCode) {
      this.metrics.markProcessed({ skipped: true, reason: 'empty_person_code' });
      return { ignored: true, reason: 'EMPTY_PERSON_CODE' };
    }

    const device = await this.findDevice({
      deviceCode: deviceCode?.trim() || undefined,
      clientIp,
    });
    if (!device) {
      this.logger.warn(
        `Device not found for code=${deviceCode ?? '—'} clientIp=${clientIp}`,
      );
      this.metrics.markProcessed({ skipped: true, reason: 'device_not_found' });
      return { skipped: true, reason: 'device_not_found' };
    }

    const eventAt = buildDoorLogEventTime(dto);
    const sourceEventId = buildDoorLogSourceEventId(dto, clientIp);
    const user = await this.findUserByEmployeeCode(employeeCode);
    const denied = !isDoorLogSuccess(dto);

    return this.persistAndEmit({
      device,
      user,
      employeeCode,
      eventAt,
      sourceEventId,
      rawPayload: dto as object,
      denied,
      deniedStatus: dto.Status,
      skipPunch: denied,
    });
  }

  /** Vendor-agnostic ingest (DNAKE unlock poll, etc.). */
  async ingestAccessEvent(params: {
    deviceId: string;
    employeeCode: string;
    eventAt: Date;
    sourceEventId: string;
    rawPayload: object;
    denied?: boolean;
  }) {
    const device = await this.prisma.device.findFirst({
      where: { id: params.deviceId, isDeleted: false },
      select: { id: true, name: true, zoneId: true },
    });
    if (!device) {
      return { skipped: true, reason: 'device_not_found' };
    }
    const user = await this.findUserByIdentity(params.employeeCode);
    return this.persistAndEmit({
      device,
      user,
      employeeCode: params.employeeCode,
      eventAt: params.eventAt,
      sourceEventId: params.sourceEventId,
      rawPayload: params.rawPayload,
      denied: params.denied,
      skipPunch: Boolean(params.denied),
    });
  }

  async handle(data: AkuvoxWebhookJobData) {
    const { payload, sourceIp } = data;
    this.logger.log(
      `Processing akuvox event employee=${payload.employeeCode ?? payload.userId ?? '—'} device=${payload.deviceCode ?? payload.deviceIp ?? sourceIp ?? '—'}`,
    );

    const deviceCode = payload.deviceCode ?? payload.deviceId;
    const deviceIp =
      typeof payload.deviceIp === 'string' && payload.deviceIp.trim()
        ? payload.deviceIp.trim()
        : undefined;

    const device = await this.findDevice({
      deviceCode: deviceCode ? String(deviceCode) : undefined,
      deviceIp,
      clientIp: sourceIp,
    });

    if (!device) {
      this.logger.warn(
        `Device not found for code=${deviceCode ?? '—'} ip=${deviceIp ?? '—'} clientIp=${sourceIp ?? '—'}`,
      );
      this.metrics.markProcessed({ skipped: true, reason: 'device_not_found' });
      return { skipped: true, reason: 'device_not_found' };
    }

    const employeeCode = payload.employeeCode ?? payload.userId;
    const user = await this.findUserByEmployeeCode(
      employeeCode ? String(employeeCode) : undefined,
    );

    let pendingSnapshot: { path: string; buffer: Buffer } | undefined;
    const imageData = payload.captureImage ?? payload.imageBase64;
    if (imageData && typeof imageData === 'string') {
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > 0) {
        pendingSnapshot = {
          path: `snapshots/${device.id}/${Date.now()}.jpg`,
          buffer,
        };
      }
    }

    const sourceEventId = payload.eventId ?? `evt-${Date.now()}`;
    const eventAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

    return this.persistAndEmit({
      device,
      user,
      employeeCode: employeeCode ? String(employeeCode) : undefined,
      eventAt,
      sourceEventId,
      rawPayload: payload as object,
      pendingSnapshot,
      skipPunch: false,
    });
  }

  private async persistAndEmit(params: {
    device: { id: string; name: string; zoneId: string | null };
    user: Awaited<ReturnType<AkuvoxEventService['findUserByEmployeeCode']>>;
    employeeCode?: string;
    eventAt: Date;
    sourceEventId: string;
    rawPayload: object;
    pendingSnapshot?: { path: string; buffer: Buffer };
    denied?: boolean;
    deniedStatus?: string;
    skipPunch?: boolean;
  }) {
    const { device, user, eventAt, sourceEventId, rawPayload, pendingSnapshot } = params;
    const snapshotFromPayload = pendingSnapshot ?? this.snapshotFromPayload(device.id, rawPayload);

    if (user?.id) {
      const cooldownSince = new Date(eventAt.getTime() - FACE_SCAN_COOLDOWN_MS);
      const recent = await this.prisma.accessLog.findFirst({
        where: {
          userId: user.id,
          deviceId: device.id,
          eventAt: { gte: cooldownSince, lte: eventAt },
          NOT: { sourceEventId },
        },
        orderBy: { eventAt: 'desc' },
        select: { id: true, eventAt: true },
      });
      if (recent) {
        this.metrics.markProcessed({ skipped: true, reason: 'cooldown_5m' });
        this.logger.log(
          `Skipped face scan cooldown_5m user=${user.employeeCode} device=${device.id} previous=${recent.id} at=${recent.eventAt.toISOString()}`,
        );
        return {
          ignored: true,
          reason: 'COOLDOWN_5M',
          previousAccessLogId: recent.id,
        };
      }
    }

    let action: PrismaAccessAction = PrismaAccessAction.CHECK_IN;
    let attendanceId: string | undefined;
    let punchWarning: string | undefined;
    let zoneDenied = false;

    if (params.denied) {
      action = PrismaAccessAction.DENIED;
      punchWarning = params.deniedStatus?.trim() || 'Access denied';
    } else if (user && !params.skipPunch) {
      const gate = await this.resolveZonePunchGate({
        userId: user.id,
        deviceZoneId: device.zoneId,
      });
      if (!gate.allowPunch) {
        zoneDenied = true;
        action = PrismaAccessAction.DENIED;
        punchWarning = gate.warning;
        this.logger.log(
          `Zone gate blocked punch user=${user.employeeCode} device=${device.name} zone=${device.zoneId ?? '—'} msg=${gate.warning}`,
        );
      } else {
        const punch = await this.attendance.processPunch(user.id, eventAt);
        attendanceId = punch.record?.id;
        if (punch.outcome === 'IGNORED') {
          action = PrismaAccessAction.UNKNOWN;
          punchWarning =
            punch.reason === 'NO_SHIFT'
              ? 'Chưa gán ca — không tính chấm công'
              : 'Sự kiện ra vào — không tính thêm chấm công';
          this.logger.log(
            `Notify without punch reason=${punch.reason ?? '—'} user=${user.employeeCode} device=${device.name}`,
          );
        } else {
          punchWarning = punch.message;
          action = this.toPrismaAction(punch);
          if (punch.outcome === 'CHECK_IN' || punch.outcome === 'CHECK_OUT') {
            await this.upsertPresence(user.id, action, device.zoneId, eventAt);
          }
        }
      }
    } else if (!user) {
      action = PrismaAccessAction.UNKNOWN;
    }

    const isValid = !!user && !params.denied && !zoneDenied;
    const warningMessage = params.denied
      ? punchWarning
      : zoneDenied
        ? punchWarning
        : user
          ? punchWarning
          : 'Unknown person';

    const accessLog = await this.prisma.accessLog.upsert({
      where: {
        deviceId_sourceEventId: {
          deviceId: device.id,
          sourceEventId,
        },
      },
        create: {
        userId: user?.id,
        deviceId: device.id,
        zoneId: device.zoneId,
        projectId: user?.projectId ?? null,
        action,
        sourceEventId,
        snapshotPath: null,
        rawPayload,
        isValid,
        warningMessage,
        eventAt,
      },
      update: {
        userId: user?.id,
        zoneId: device.zoneId,
        projectId: user?.projectId ?? null,
        action,
        rawPayload,
        isValid,
        warningMessage,
        eventAt,
      },
    });

    const faceImageUrl = user?.faceImagePath
      ? await this.storage
          .getAssetUrl(user.faceImagePath, { forBrowser: true })
          .catch(() => undefined)
      : undefined;

    const checkinEvent: CheckinEvent = {
      id: accessLog.id,
      userId: user?.id,
      employeeCode: user?.employeeCode ?? params.employeeCode,
      fullName: user?.fullName,
      departmentName: user?.department?.name,
      deviceId: device.id,
      deviceName: device.name,
      action: this.toSocketAction(action),
      timestamp: eventAt.toISOString(),
      snapshotUrl: undefined,
      faceImageUrl,
      isValid,
      warningMessage,
    };

    this.eventsGateway.emitCheckinEvent(checkinEvent);
    this.metrics.markProcessed({ accessLogId: accessLog.id });
    this.logger.log(
      `Processed event accessLogId=${accessLog.id} action=${action} attendanceId=${attendanceId ?? '—'} valid=${isValid}`,
    );

    this.scheduleSnapshot(accessLog.id, device.id, checkinEvent, eventAt, snapshotFromPayload);

    return { processed: true, accessLogId: accessLog.id, attendanceId };
  }

  private snapshotFromPayload(
    deviceId: string,
    raw: object,
  ): { path: string; buffer: Buffer } | undefined {
    const rec = raw as Record<string, unknown>;
    const imageData = rec.captureImage ?? rec.imageBase64 ?? rec.pic ?? rec.photo ?? rec.image;
    if (typeof imageData !== 'string' || !imageData.trim()) return undefined;
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length < 80) return undefined;
    return { path: `snapshots/${deviceId}/${Date.now()}.jpg`, buffer };
  }
}

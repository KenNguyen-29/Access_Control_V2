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

/** Suppress repeat face scans for the same person (no AccessLog / socket / punch). */
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
    const code = employeeCode?.trim();
    if (!code) return null;
    return this.prisma.user.findFirst({
      where: {
        employeeCode: { equals: code, mode: 'insensitive' },
        isDeleted: false,
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
        const snapshotUrl = await this.storage.getSignedUrl(snapshotPath).catch(() => undefined);
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

  async processDoorLog(dto: AkuvoxDoorLogPayload, clientIp: string) {
    const employeeCode = normalizedDoorLogUserId(dto);
    if (!employeeCode) {
      this.metrics.markProcessed({ skipped: true, reason: 'empty_person_code' });
      return { ignored: true, reason: 'EMPTY_PERSON_CODE' };
    }

    const device = await this.findDevice({ clientIp });
    if (!device) {
      this.logger.warn(`Device not found for clientIp=${clientIp}`);
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

    // Same person scanned again within 5 minutes → skip notify (Sự kiện / toast) and punch.
    if (user?.id) {
      const cooldownSince = new Date(eventAt.getTime() - FACE_SCAN_COOLDOWN_MS);
      const recent = await this.prisma.accessLog.findFirst({
        where: {
          userId: user.id,
          eventAt: { gte: cooldownSince, lte: eventAt },
          NOT: { sourceEventId },
        },
        orderBy: { eventAt: 'desc' },
        select: { id: true, eventAt: true },
      });
      if (recent) {
        this.metrics.markProcessed({ skipped: true, reason: 'cooldown_5m' });
        this.logger.log(
          `Skipped face scan cooldown_5m user=${user.employeeCode} previous=${recent.id} at=${recent.eventAt.toISOString()}`,
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

    if (params.denied) {
      action = PrismaAccessAction.DENIED;
      punchWarning = params.deniedStatus?.trim() || 'Access denied';
    } else if (user && !params.skipPunch) {
      const punch = await this.attendance.processPunch(user.id, eventAt);
      if (punch.outcome === 'IGNORED') {
        this.metrics.markProcessed({ skipped: true, reason: punch.reason ?? 'ignored' });
        this.logger.log(
          `Skipped notify punch ignored reason=${punch.reason ?? '—'} user=${user.employeeCode}`,
        );
        return {
          ignored: true,
          reason: punch.reason ?? 'IGNORED',
          attendanceId: punch.record?.id,
        };
      }
      attendanceId = punch.record?.id;
      punchWarning = punch.message;
      action = this.toPrismaAction(punch);

      if (punch.outcome === 'CHECK_IN' || punch.outcome === 'CHECK_OUT') {
        await this.upsertPresence(user.id, action, device.zoneId, eventAt);
      }
    } else if (!user) {
      action = PrismaAccessAction.UNKNOWN;
    }

    const warningMessage = params.denied
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
        action,
        sourceEventId,
        snapshotPath: null,
        rawPayload,
        isValid: !!user && !params.denied,
        warningMessage,
        eventAt,
      },
      update: {
        userId: user?.id,
        zoneId: device.zoneId,
        action,
        rawPayload,
        isValid: !!user && !params.denied,
        warningMessage,
        eventAt,
      },
    });

    const faceImageUrl = user?.faceImagePath
      ? await this.storage.getAssetUrl(user.faceImagePath).catch(() => undefined)
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
      isValid: !!user && !params.denied,
      warningMessage,
    };

    this.eventsGateway.emitCheckinEvent(checkinEvent);
    this.metrics.markProcessed({ accessLogId: accessLog.id });
    this.logger.log(
      `Processed akuvox event accessLogId=${accessLog.id} action=${action} attendanceId=${attendanceId ?? '—'}`,
    );

    if (pendingSnapshot) {
      this.finalizeSnapshotAsync(
        accessLog.id,
        pendingSnapshot.path,
        pendingSnapshot.buffer,
        checkinEvent,
      );
    }

    return { processed: true, accessLogId: accessLog.id, attendanceId };
  }
}

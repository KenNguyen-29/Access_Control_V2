import { Injectable, Logger } from '@nestjs/common';
import { AccessAction as PrismaAccessAction, PresenceStatus } from '@prisma/client';
import { AccessAction, AkuvoxWebhookJobData } from '@acv2/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EventsGateway } from '../events/events.gateway';
import { AttendanceService, PunchResult } from '../attendance/attendance.service';

@Injectable()
export class AkuvoxEventService {
  private readonly logger = new Logger(AkuvoxEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly eventsGateway: EventsGateway,
    private readonly attendance: AttendanceService,
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
    return AccessAction.UNKNOWN;
  }

  async handle(data: AkuvoxWebhookJobData) {
    const { payload } = data;

    const deviceCode = payload.deviceCode ?? payload.deviceId;
    const deviceIp =
      typeof payload.deviceIp === 'string' && payload.deviceIp.trim()
        ? payload.deviceIp.trim()
        : undefined;

    let device = deviceCode
      ? await this.prisma.device.findFirst({
          where: { code: String(deviceCode), isDeleted: false },
        })
      : null;

    if (!device && deviceIp) {
      device = await this.prisma.device.findFirst({
        where: { ipAddress: deviceIp, isDeleted: false },
      });
    }

    if (!device) {
      this.logger.warn(`Device not found for code=${deviceCode ?? '—'} ip=${deviceIp ?? '—'}`);
      return { skipped: true, reason: 'device_not_found' };
    }

    const employeeCode = payload.employeeCode ?? payload.userId;
    const user = employeeCode
      ? await this.prisma.user.findFirst({
          where: { employeeCode: String(employeeCode), isDeleted: false },
          include: { department: true },
        })
      : null;

    let snapshotPath: string | undefined;
    const imageData = payload.captureImage ?? payload.imageBase64;
    if (imageData && typeof imageData === 'string') {
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      snapshotPath = `snapshots/${device.id}/${Date.now()}.jpg`;
      try {
        await this.storage.uploadFile(snapshotPath, buffer, 'image/jpeg');
      } catch (err) {
        this.logger.warn(`Snapshot upload failed: ${(err as Error).message}`);
        snapshotPath = undefined;
      }
    }

    const sourceEventId = payload.eventId ?? `evt-${Date.now()}`;
    const eventAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

    let action: PrismaAccessAction = PrismaAccessAction.CHECK_IN;
    let attendanceId: string | undefined;
    let punchWarning: string | undefined;

    if (user) {
      const punch = await this.attendance.processPunch(user.id, eventAt);
      attendanceId = punch.record?.id;
      punchWarning = punch.message;
      action = this.toPrismaAction(punch);

      if (punch.outcome === 'CHECK_IN' || punch.outcome === 'CHECK_OUT') {
        await this.upsertPresence(user.id, action, device.zoneId, eventAt);
      }
    }

    const warningMessage = user
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
        snapshotPath,
        rawPayload: payload as object,
        isValid: !!user,
        warningMessage,
        eventAt,
      },
      update: {},
    });

    const checkinEvent = {
      id: accessLog.id,
      userId: user?.id,
      employeeCode: user?.employeeCode,
      fullName: user?.fullName,
      departmentName: user?.department?.name,
      deviceId: device.id,
      deviceName: device.name,
      action: this.toSocketAction(action),
      timestamp: eventAt.toISOString(),
      snapshotUrl: snapshotPath
        ? await this.storage.getSignedUrl(snapshotPath).catch(() => undefined)
        : undefined,
      faceImageUrl: user?.faceImagePath
        ? await this.storage.getAssetUrl(user.faceImagePath).catch(() => undefined)
        : undefined,
      isValid: !!user,
      warningMessage,
    };

    this.eventsGateway.emitCheckinEvent(checkinEvent);

    return { processed: true, accessLogId: accessLog.id, attendanceId };
  }
}

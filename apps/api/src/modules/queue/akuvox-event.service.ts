import { Injectable, Logger } from '@nestjs/common';
import { AccessAction as PrismaAccessAction, PresenceStatus } from '@prisma/client';
import { AccessAction, AkuvoxWebhookJobData } from '@acv2/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EventsGateway } from '../events/events.gateway';
import { AttendanceService } from '../attendance/attendance.service';

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

  async handle(data: AkuvoxWebhookJobData) {
    const { payload } = data;

    const deviceCode = payload.deviceCode ?? payload.deviceId;
    const device = deviceCode
      ? await this.prisma.device.findFirst({
          where: { code: String(deviceCode), isDeleted: false },
        })
      : null;

    if (!device) {
      this.logger.warn(`Device not found for code: ${deviceCode}`);
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

    if (user) {
      const existing = await this.prisma.attendanceRecord.findUnique({
        where: {
          userId_date: {
            userId: user.id,
            date: new Date(Date.UTC(eventAt.getFullYear(), eventAt.getMonth(), eventAt.getDate())),
          },
        },
      });
      action = existing?.checkInAt ? PrismaAccessAction.CHECK_OUT : PrismaAccessAction.CHECK_IN;

      const attendance = await this.attendance.processPunch(user.id, eventAt);
      attendanceId = attendance.id;
      await this.upsertPresence(user.id, action, device.zoneId, eventAt);
    }

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
        warningMessage: user ? undefined : 'Unknown person',
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
      action: action === PrismaAccessAction.CHECK_OUT ? AccessAction.CHECK_OUT : AccessAction.CHECK_IN,
      timestamp: eventAt.toISOString(),
      snapshotUrl: snapshotPath
        ? await this.storage.getSignedUrl(snapshotPath).catch(() => undefined)
        : undefined,
      faceImageUrl: user?.faceImagePath
        ? await this.storage.getAssetUrl(user.faceImagePath).catch(() => undefined)
        : undefined,
      isValid: !!user,
      warningMessage: user ? undefined : 'Unknown person',
    };

    this.eventsGateway.emitCheckinEvent(checkinEvent);

    return { processed: true, accessLogId: accessLog.id, attendanceId };
  }
}

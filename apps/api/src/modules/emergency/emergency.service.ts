import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessAction, EmergencySafeStatus, PresenceStatus } from '@prisma/client';
import { FireEmergencyEvent } from '@acv2/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class EmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  private async setEmergencyMode(on: boolean) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'EMERGENCY_MODE' },
      update: { value: on ? 'TRUE' : 'FALSE' },
      create: { key: 'EMERGENCY_MODE', value: on ? 'TRUE' : 'FALSE' },
    });
  }

  async handleFireWebhook(description?: string, createdById?: string) {
    const startTime = new Date();
    const event = await this.prisma.emergencyEvent.create({
      data: {
        eventType: 'FIRE_EMERGENCY',
        startTime,
        description: description ?? 'Fire alarm triggered',
        createdById,
      },
    });

    await this.setEmergencyMode(true);

    const insideUsers = await this.prisma.userPresence.findMany({
      where: {
        currentStatus: { in: [PresenceStatus.CHECK_IN, PresenceStatus.INSIDE] },
      },
      include: {
        user: { select: { id: true, fullName: true, employeeCode: true } },
      },
    });

    const musterRows: Array<{ id: string }> = [];
    for (const p of insideUsers) {
      const row = await this.prisma.emergencyMuster.create({
        data: {
          eventId: event.id,
          userId: p.userId,
          safeStatus: EmergencySafeStatus.INSIDE,
        },
      });
      musterRows.push(row);

      await this.prisma.accessLog.create({
        data: {
          userId: p.userId,
          action: AccessAction.FIRE_EMERGENCY,
          eventAt: startTime,
          sourceEventId: `fire-${event.id}-${p.userId}`,
          isValid: true,
          rawPayload: { eventSource: 'EMERGENCY_WEBHOOK' },
        },
      });
    }

    const payload: FireEmergencyEvent = {
      type: 'FIRE_EMERGENCY',
      eventId: event.id,
      description: event.description ?? undefined,
      people: insideUsers.map((p, i) => ({
        musterId: musterRows[i].id,
        userId: p.userId,
        fullName: p.user?.fullName ?? p.userId,
        employeeCode: p.user?.employeeCode,
        safeStatus: EmergencySafeStatus.INSIDE,
      })),
    };
    this.events.emitFireEmergency(payload);

    return { event, musterCount: insideUsers.length };
  }

  async getDashboard(eventId?: string) {
    const active = eventId
      ? await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } })
      : await this.prisma.emergencyEvent.findFirst({
          where: { endTime: null, eventType: 'FIRE_EMERGENCY' },
          orderBy: { startTime: 'desc' },
        });

    if (!active) return { event: null, muster: [] };

    const muster = await this.prisma.emergencyMuster.findMany({
      where: { eventId: active.id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            phone: true,
            faceImagePath: true,
          },
        },
      },
      orderBy: { safeStatus: 'asc' },
    });

    return { event: active, muster };
  }

  async markSafe(
    musterId: string,
    safeStatus: EmergencySafeStatus,
    markedById?: string,
    remarks?: string,
  ) {
    const row = await this.prisma.emergencyMuster.findFirst({ where: { id: musterId } });
    if (!row) throw new NotFoundException('Muster record not found');
    return this.prisma.emergencyMuster.update({
      where: { id: musterId },
      data: {
        safeStatus,
        markedById,
        markedTime: new Date(),
        remarks,
      },
    });
  }

  async endEmergency(eventId: string) {
    const event = await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Emergency event not found');
    await this.prisma.emergencyEvent.update({
      where: { id: eventId },
      data: { endTime: new Date() },
    });
    await this.setEmergencyMode(false);
    return { ended: true };
  }
}

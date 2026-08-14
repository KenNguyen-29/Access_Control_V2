import { PrismaService } from '../../prisma/prisma.service';

export type PunchLocation = {
  zoneId: string | null;
  zoneName: string | null;
  deviceId: string | null;
  deviceName: string | null;
};

type PunchLike = {
  userId: string;
  checkInAt?: Date | string | null;
};

/**
 * Attach zone/device from the AccessLog closest to each record's check-in.
 */
export async function attachPunchLocations<T extends PunchLike>(
  prisma: PrismaService,
  items: T[],
): Promise<Array<T & { punchLocation: PunchLocation | null }>> {
  if (items.length === 0) return [];

  const withCheckIn = items.filter((i) => i.checkInAt);
  if (withCheckIn.length === 0) {
    return items.map((i) => ({ ...i, punchLocation: null }));
  }

  const times = withCheckIn.map((i) => new Date(i.checkInAt as Date | string).getTime());
  const minTs = Math.min(...times) - 60_000;
  const maxTs = Math.max(...times) + 60_000;
  const userIds = [...new Set(withCheckIn.map((i) => i.userId))];

  const logs = await prisma.accessLog.findMany({
    where: {
      userId: { in: userIds },
      isValid: true,
      eventAt: { gte: new Date(minTs), lte: new Date(maxTs) },
      action: { in: ['CHECK_IN', 'CHECK_OUT', 'UNKNOWN'] },
    },
    select: {
      userId: true,
      eventAt: true,
      zoneId: true,
      deviceId: true,
      zone: { select: { id: true, name: true } },
      device: { select: { id: true, name: true } },
    },
    orderBy: { eventAt: 'asc' },
  });

  const byUser = new Map<string, typeof logs>();
  for (const log of logs) {
    if (!log.userId) continue;
    const list = byUser.get(log.userId) ?? [];
    list.push(log);
    byUser.set(log.userId, list);
  }

  return items.map((item) => {
    if (!item.checkInAt) return { ...item, punchLocation: null };
    const checkInMs = new Date(item.checkInAt).getTime();
    const candidates = byUser.get(item.userId) ?? [];
    let best: (typeof logs)[number] | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const log of candidates) {
      const delta = Math.abs(log.eventAt.getTime() - checkInMs);
      if (delta < bestDelta && delta <= 120_000) {
        bestDelta = delta;
        best = log;
      }
    }
    if (!best) return { ...item, punchLocation: null };
    return {
      ...item,
      punchLocation: {
        zoneId: best.zoneId ?? best.zone?.id ?? null,
        zoneName: best.zone?.name ?? null,
        deviceId: best.deviceId ?? best.device?.id ?? null,
        deviceName: best.device?.name ?? null,
      },
    };
  });
}

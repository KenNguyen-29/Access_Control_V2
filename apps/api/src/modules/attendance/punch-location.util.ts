import { PrismaService } from '../../prisma/prisma.service';

export type PunchLocation = {
  zoneId: string | null;
  zoneName: string | null;
  deviceId: string | null;
  deviceName: string | null;
};

export type PunchMedia = {
  punchLocation: PunchLocation | null;
  /** AccessLog.snapshotPath closest to check-in. */
  checkInSnapshotPath: string | null;
  /** AccessLog.snapshotPath closest to check-out. */
  checkOutSnapshotPath: string | null;
};

type PunchLike = {
  userId: string;
  checkInAt?: Date | string | null;
  checkOutAt?: Date | string | null;
};

const MATCH_WINDOW_MS = 120_000;
const QUERY_PAD_MS = 60_000;

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function closestLog<T extends { eventAt: Date }>(
  candidates: T[],
  targetMs: number | null,
): T | null {
  if (targetMs == null || candidates.length === 0) return null;
  let best: T | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const log of candidates) {
    const delta = Math.abs(log.eventAt.getTime() - targetMs);
    if (delta < bestDelta && delta <= MATCH_WINDOW_MS) {
      bestDelta = delta;
      best = log;
    }
  }
  return best;
}

/**
 * Attach zone/device from the AccessLog closest to check-in,
 * plus snapshot paths for check-in and check-out punches.
 */
export async function attachPunchLocations<T extends PunchLike>(
  prisma: PrismaService,
  items: T[],
): Promise<Array<T & PunchMedia>> {
  if (items.length === 0) return [];

  const times: number[] = [];
  for (const item of items) {
    const inMs = toMs(item.checkInAt);
    const outMs = toMs(item.checkOutAt);
    if (inMs != null) times.push(inMs);
    if (outMs != null) times.push(outMs);
  }

  if (times.length === 0) {
    return items.map((i) => ({
      ...i,
      punchLocation: null,
      checkInSnapshotPath: null,
      checkOutSnapshotPath: null,
    }));
  }

  const minTs = Math.min(...times) - QUERY_PAD_MS;
  const maxTs = Math.max(...times) + QUERY_PAD_MS;
  const userIds = [...new Set(items.map((i) => i.userId))];

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
      snapshotPath: true,
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
    const candidates = byUser.get(item.userId) ?? [];
    const checkInMs = toMs(item.checkInAt);
    const checkOutMs = toMs(item.checkOutAt);
    const inLog = closestLog(candidates, checkInMs);
    const outLog = closestLog(candidates, checkOutMs);

    const punchLocation: PunchLocation | null = inLog
      ? {
          zoneId: inLog.zoneId ?? inLog.zone?.id ?? null,
          zoneName: inLog.zone?.name ?? null,
          deviceId: inLog.deviceId ?? inLog.device?.id ?? null,
          deviceName: inLog.device?.name ?? null,
        }
      : null;

    return {
      ...item,
      punchLocation,
      checkInSnapshotPath: inLog?.snapshotPath ?? null,
      checkOutSnapshotPath: outLog?.snapshotPath ?? null,
    };
  });
}

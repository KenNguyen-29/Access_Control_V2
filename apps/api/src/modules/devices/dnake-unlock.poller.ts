import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DnakeService } from './dnake.service';
import { AkuvoxEventService } from '../queue/akuvox-event.service';

/**
 * DNAKE Unlock Logs (UI Access → Unlock Logs):
 * unlock_type: Face / Card / Password / Intercom (numeric firmware-dependent).
 * We ingest Face + Card successful unlocks for attendance.
 */
const ATTENDANCE_UNLOCK_TYPES = new Set([1, 2, 3, 4]);

@Injectable()
export class DnakeUnlockPoller {
  private readonly logger = new Logger(DnakeUnlockPoller.name);
  private running = false;
  private readonly enabled: boolean;

  constructor(
    private readonly dnake: DnakeService,
    private readonly events: AkuvoxEventService,
    private readonly config: ConfigService,
  ) {
    this.enabled = this.config.get<string>('DNAKE_POLL_ENABLED', 'true') === 'true';
  }

  @Interval(10_000)
  async tick() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      const devices = await this.dnake.listActiveDevices();
      for (const device of devices) {
        await this.pollDevice(device);
      }
    } catch (err) {
      this.logger.warn(`DNAKE poll tick failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }

  private async pollDevice(device: Awaited<ReturnType<DnakeService['listActiveDevices']>>[number]) {
    const cfg = this.dnake.parseConfig(device);
    const lastTs = cfg.lastUnlockTs ?? 0;

    let logs: Awaited<ReturnType<DnakeService['fetchUnlockLogs']>>;
    try {
      logs = await this.dnake.fetchUnlockLogs(device);
    } catch (err) {
      this.logger.warn(
        `DNAKE unlock fetch failed device=${device.code}: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }

    const sorted = [...logs].sort((a, b) => Number(a.ts) - Number(b.ts));
    let maxTs = lastTs;

    for (const row of sorted) {
      const ts = Number(row.ts);
      if (!Number.isFinite(ts) || ts <= lastTs) continue;
      maxTs = Math.max(maxTs, ts);

      const unlockType = Number(row.unlock_type);
      if (!ATTENDANCE_UNLOCK_TYPES.has(unlockType)) continue;

      // Success in DNAKE UI; firmware commonly uses 1.
      const status = Number(row.status);
      if (status !== 1) continue;

      const employeeCode = String(row.number || row.name || '').trim();
      if (!employeeCode || employeeCode.toLowerCase() === 'none') continue;

      // ts may be unix seconds or ms
      const eventAt = new Date(ts > 1e12 ? ts : ts * 1000);
      const sourceEventId = `dnake:${device.id}:${ts}:${employeeCode}`;

      try {
        await this.events.ingestAccessEvent({
          deviceId: device.id,
          employeeCode,
          eventAt,
          sourceEventId,
          rawPayload: row as object,
          denied: false,
        });
      } catch (err) {
        this.logger.warn(
          `DNAKE ingest failed device=${device.code} code=${employeeCode}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    if (maxTs > lastTs) {
      await this.dnake.updateLastUnlockTs(device.id, maxTs);
    }
  }
}

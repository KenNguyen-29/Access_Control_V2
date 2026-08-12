import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DnakeService } from './dnake.service';
import { AkuvoxEventService } from '../queue/akuvox-event.service';

/** DNAKE unlock log: status 0 = Success (Apifox samples); -1 = no user / failed. */
function isDnakeUnlockSuccess(status: number): boolean {
  return status === 0 || status === 1;
}

/** unlock_type 2 = Face in Apifox samples; 1 = Card; 0 may appear on some firmwares. */
function isDnakeAttendanceUnlock(unlockType: number): boolean {
  return unlockType === 0 || unlockType === 1 || unlockType === 2;
}

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
      if (!isDnakeAttendanceUnlock(unlockType)) continue;

      const status = Number(row.status);
      if (!isDnakeUnlockSuccess(status)) continue;

      const number = String(row.number || '').trim();
      const name = String(row.name || '').trim();
      const identity = number || name;
      if (!identity || identity.toLowerCase() === 'none') continue;

      // ts may be unix seconds or ms
      const eventAt = new Date(ts > 1e12 ? ts : ts * 1000);
      const sourceEventId = `dnake:${device.id}:${ts}:${identity}`;

      try {
        const result = await this.events.ingestAccessEvent({
          deviceId: device.id,
          employeeCode: identity,
          eventAt,
          sourceEventId,
          rawPayload: row as object,
          denied: false,
        });
        if (result && 'processed' in result && result.processed) {
          this.logger.log(
            `DNAKE ingested device=${device.code} identity=${identity} ts=${ts} unlock_type=${unlockType}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `DNAKE ingest failed device=${device.code} identity=${identity}: ${
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

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AkuvoxWebhookPayload, AkuvoxWebhookJobData } from '@acv2/shared';
import { AKUVOX_QUEUE } from '../queue/queue.constants';
import { AkuvoxEventService } from '../queue/akuvox-event.service';
import { RealtimeMetricsService } from '../events/realtime-metrics.service';
import { AkuvoxDoorLogPayload } from './akuvox-door-log.util';

export interface AkuvoxDoorLogJobData {
  dto: AkuvoxDoorLogPayload;
  clientIp: string;
  deviceCode?: string;
  receivedAt: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly events: AkuvoxEventService,
    private readonly metrics: RealtimeMetricsService,
    @Optional()
    @InjectQueue(AKUVOX_QUEUE)
    private readonly akuvoxQueue?: Queue<AkuvoxWebhookJobData | AkuvoxDoorLogJobData>,
  ) {}

  async enqueueAkuvoxEvent(payload: AkuvoxWebhookPayload, sourceIp?: string) {
    const data: AkuvoxWebhookJobData = {
      payload,
      receivedAt: new Date().toISOString(),
      sourceIp,
    };

    if (this.akuvoxQueue) {
      const job = await this.akuvoxQueue.add('process', data);
      this.metrics.markWebhook({ mode: 'queue', jobId: job.id != null ? String(job.id) : null });
      this.logger.log(
        `Enqueued akuvox job mode=queue jobId=${job.id} employee=${payload.employeeCode ?? '—'} device=${payload.deviceCode ?? payload.deviceIp ?? '—'}`,
      );
      return { jobId: job.id, mode: 'queue' as const };
    }

    this.metrics.markWebhook({ mode: 'sync', jobId: 'sync' });
    const result = await this.events.handle(data);
    this.logger.log(
      `Processed akuvox sync employee=${payload.employeeCode ?? '—'} device=${payload.deviceCode ?? payload.deviceIp ?? '—'}`,
    );
    return { jobId: 'sync', mode: 'sync' as const, result };
  }

  async processDoorLog(dto: AkuvoxDoorLogPayload, clientIp: string, deviceCode?: string) {
    const data: AkuvoxDoorLogJobData = {
      dto,
      clientIp,
      deviceCode: deviceCode?.trim() || undefined,
      receivedAt: new Date().toISOString(),
    };

    if (this.akuvoxQueue) {
      const job = await this.akuvoxQueue.add('process-door-log', data);
      this.metrics.markWebhook({ mode: 'queue', jobId: job.id != null ? String(job.id) : null });
      this.logger.log(`Enqueued door_log job id=${job.id} clientIp=${clientIp} code=${deviceCode ?? '—'}`);
      return { jobId: job.id, mode: 'queue' as const };
    }

    this.metrics.markWebhook({ mode: 'sync', jobId: 'sync' });
    const result = await this.events.processDoorLog(dto, clientIp, deviceCode);
    this.logger.log(`Processed door_log sync clientIp=${clientIp} code=${deviceCode ?? '—'}`);
    return { jobId: 'sync', mode: 'sync' as const, result };
  }
}

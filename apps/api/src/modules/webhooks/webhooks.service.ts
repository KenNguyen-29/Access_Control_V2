import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AkuvoxWebhookPayload, AkuvoxWebhookJobData } from '@acv2/shared';
import { AKUVOX_QUEUE } from '../queue/queue.constants';
import { AkuvoxEventService } from '../queue/akuvox-event.service';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly events: AkuvoxEventService,
    @Optional() @InjectQueue(AKUVOX_QUEUE) private readonly akuvoxQueue?: Queue<AkuvoxWebhookJobData>,
  ) {}

  async enqueueAkuvoxEvent(payload: AkuvoxWebhookPayload, sourceIp?: string) {
    const data: AkuvoxWebhookJobData = {
      payload,
      receivedAt: new Date().toISOString(),
      sourceIp,
    };

    if (this.akuvoxQueue) {
      const job = await this.akuvoxQueue.add('process', data);
      return { jobId: job.id, mode: 'queue' as const };
    }

    const result = await this.events.handle(data);
    return { jobId: 'sync', mode: 'sync' as const, result };
  }
}

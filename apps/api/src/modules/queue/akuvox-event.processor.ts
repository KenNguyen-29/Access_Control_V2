import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AkuvoxWebhookJobData } from '@acv2/shared';
import { AkuvoxDoorLogJobData } from '../webhooks/webhooks.service';
import { AKUVOX_QUEUE } from './queue.constants';
import { AkuvoxEventService } from './akuvox-event.service';

@Processor(AKUVOX_QUEUE, { concurrency: 8 })
export class AkuvoxEventProcessor extends WorkerHost {
  private readonly logger = new Logger(AkuvoxEventProcessor.name);

  constructor(private readonly events: AkuvoxEventService) {
    super();
  }

  async process(job: Job<AkuvoxWebhookJobData | AkuvoxDoorLogJobData>) {
    this.logger.log(`Worker picked job id=${job.id} name=${job.name}`);
    const result =
      job.name === 'process-door-log'
        ? await this.events.processDoorLog(
            (job.data as AkuvoxDoorLogJobData).dto,
            (job.data as AkuvoxDoorLogJobData).clientIp,
            (job.data as AkuvoxDoorLogJobData).deviceCode,
          )
        : await this.events.handle(job.data as AkuvoxWebhookJobData);
    this.logger.log(`Worker finished job id=${job.id}`);
    return result;
  }
}

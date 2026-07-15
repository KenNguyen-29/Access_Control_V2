import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AkuvoxWebhookJobData } from '@acv2/shared';
import { AKUVOX_QUEUE } from './queue.constants';
import { AkuvoxEventService } from './akuvox-event.service';

@Processor(AKUVOX_QUEUE)
export class AkuvoxEventProcessor extends WorkerHost {
  constructor(private readonly events: AkuvoxEventService) {
    super();
  }

  process(job: Job<AkuvoxWebhookJobData>) {
    return this.events.handle(job.data);
  }
}

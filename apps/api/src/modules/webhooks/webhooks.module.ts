import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { AkuvoxDoorLogController } from './akuvox-door-log.controller';
import { WebhooksService } from './webhooks.service';
import { AkuvoxWebhookSecurityService } from './akuvox-webhook-security.service';
import { AKUVOX_QUEUE } from '../queue/queue.constants';
import { QueueModule } from '../queue/queue.module';
import { EventsModule } from '../events/events.module';
import { isRedisEnabled } from '../../common/utils/redis.util';

const redisImports = isRedisEnabled()
  ? [
      BullModule.registerQueue({
        name: AKUVOX_QUEUE,
      }),
    ]
  : [];

@Module({
  imports: [QueueModule, EventsModule, ...redisImports],
  controllers: [WebhooksController, AkuvoxDoorLogController],
  providers: [WebhooksService, AkuvoxWebhookSecurityService],
  exports: [WebhooksService, AkuvoxWebhookSecurityService],
})
export class WebhooksModule {}

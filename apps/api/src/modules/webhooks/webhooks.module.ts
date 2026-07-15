import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { AKUVOX_QUEUE } from '../queue/queue.constants';
import { QueueModule } from '../queue/queue.module';
import { isRedisEnabled } from '../../common/utils/redis.util';

const redisImports = isRedisEnabled()
  ? [
      BullModule.registerQueue({
        name: AKUVOX_QUEUE,
      }),
    ]
  : [];

@Module({
  imports: [QueueModule, ...redisImports],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

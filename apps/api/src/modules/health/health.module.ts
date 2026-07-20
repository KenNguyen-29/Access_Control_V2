import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { EventsModule } from '../events/events.module';
import { AKUVOX_QUEUE } from '../queue/queue.constants';
import { isRedisEnabled } from '../../common/utils/redis.util';

const redisImports = isRedisEnabled()
  ? [
      BullModule.registerQueue({
        name: AKUVOX_QUEUE,
      }),
    ]
  : [];

@Module({
  imports: [EventsModule, ...redisImports],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}

import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventsModule } from '../events/events.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AkuvoxEventProcessor } from './akuvox-event.processor';
import { AkuvoxEventService } from './akuvox-event.service';
import { SnapshotCaptureService } from './snapshot-capture.service';
import { AKUVOX_QUEUE } from './queue.constants';
import { isRedisEnabled } from '../../common/utils/redis.util';

export { AKUVOX_QUEUE } from './queue.constants';

const redisImports = isRedisEnabled()
  ? [
      BullModule.registerQueue({
        name: AKUVOX_QUEUE,
      }),
    ]
  : [];

const redisProviders = isRedisEnabled() ? [AkuvoxEventProcessor] : [];

@Module({
  imports: [
    HttpModule.register({ timeout: 15000 }),
    EventsModule,
    AttendanceModule,
    ...redisImports,
  ],
  providers: [AkuvoxEventService, SnapshotCaptureService, ...redisProviders],
  exports: [AkuvoxEventService, SnapshotCaptureService, ...(isRedisEnabled() ? [BullModule] : [])],
})
export class QueueModule {}

import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { RealtimeMetricsService } from './realtime-metrics.service';

@Module({
  providers: [EventsGateway, RealtimeMetricsService],
  exports: [EventsGateway, RealtimeMetricsService],
})
export class EventsModule {}

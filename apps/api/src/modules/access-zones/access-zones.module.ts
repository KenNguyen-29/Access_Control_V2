import { Module } from '@nestjs/common';
import { AccessZonesController } from './access-zones.controller';
import { AccessZonesService } from './access-zones.service';

@Module({
  controllers: [AccessZonesController],
  providers: [AccessZonesService],
  exports: [AccessZonesService],
})
export class AccessZonesModule {}

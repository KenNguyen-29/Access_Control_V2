import { Module } from '@nestjs/common';
import { DeviceMappingsController } from './device-mappings.controller';
import { DeviceMappingsService } from './device-mappings.service';

@Module({
  controllers: [DeviceMappingsController],
  providers: [DeviceMappingsService],
  exports: [DeviceMappingsService],
})
export class DeviceMappingsModule {}

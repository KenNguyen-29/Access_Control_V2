import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { AkuvoxService } from './akuvox.service';
import { Go2RtcProcessService } from './go2rtc-process.service';
import { Go2RtcService } from './go2rtc.service';
import { DeviceWebRtcService } from './device-webrtc.service';

@Module({
  imports: [HttpModule.register({ timeout: 15000 })],
  controllers: [DevicesController],
  providers: [
    DevicesService,
    AkuvoxService,
    Go2RtcProcessService,
    Go2RtcService,
    DeviceWebRtcService,
  ],
  exports: [DevicesService, AkuvoxService],
})
export class DevicesModule {}

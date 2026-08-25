import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { AkuvoxService } from './akuvox.service';
import { DnakeService } from './dnake.service';
import { DnakeUnlockPoller } from './dnake-unlock.poller';
import { Go2RtcProcessService } from './go2rtc-process.service';
import { Go2RtcService } from './go2rtc.service';
import { DeviceWebRtcService } from './device-webrtc.service';
import { OnvifDiscoveryService } from './onvif-discovery.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { RbacModule } from '../../common/rbac/rbac.module';

@Module({
  imports: [
    HttpModule.register({ timeout: 15000 }),
    WebhooksModule,
    QueueModule,
    StorageModule,
    RbacModule,
  ],
  controllers: [DevicesController],
  providers: [
    DevicesService,
    AkuvoxService,
    DnakeService,
    DnakeUnlockPoller,
    Go2RtcProcessService,
    Go2RtcService,
    DeviceWebRtcService,
    OnvifDiscoveryService,
  ],
  exports: [DevicesService, AkuvoxService, DnakeService],
})
export class DevicesModule {}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Go2RtcService, WebRtcSessionDescription } from './go2rtc.service';
import { buildRtspUrlWithCredentials } from './utils/rtsp-url.util';

@Injectable()
export class DeviceWebRtcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly go2rtc: Go2RtcService,
  ) {}

  async exchange(
    deviceId: string,
    offer: WebRtcSessionDescription,
  ): Promise<WebRtcSessionDescription> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, isDeleted: false },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (device.deviceType !== DeviceType.CAMERA) {
      throw new BadRequestException('Xem trực tiếp WebRTC chỉ hỗ trợ camera RTSP');
    }
    if (!device.rtspUrl || !device.rtspUrl.trim()) {
      throw new BadRequestException('Camera chưa có RTSP URL. Cập nhật trong Quản lý thiết bị và lưu.');
    }

    const rtspUrl = buildRtspUrlWithCredentials(
      device.rtspUrl,
      device.rtspUsername,
      device.rtspPassword,
    );
    const streamName = this.go2rtc.streamNameForDevice(device.id);

    await this.go2rtc.removeStream(streamName);
    await this.go2rtc.upsertStream(streamName, rtspUrl);
    await this.go2rtc.probeStream(streamName);
    return this.go2rtc.exchangeWebRtc(streamName, offer);
  }
}

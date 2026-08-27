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

    // PATCH/PUT updates the source without tearing down an existing consumer.
    // Removing it first makes reconnects race the lazy producer and can leave
    // the dashboard with a stale/broken stream.
    await this.go2rtc.upsertStream(streamName, rtspUrl);
    // Do not probe and immediately close a consumer before the WebRTC
    // handshake. go2rtc stops lazy producers when the probe consumer closes,
    // which races the next consumer and surfaces as FFmpeg "Broken pipe".
    // The WebRTC exchange itself starts the producer and reports RTSP errors.
    return this.go2rtc.exchangeWebRtc(streamName, offer);
  }
}

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRtspUrlWithCredentials } from '../devices/utils/rtsp-url.util';

/**
 * Capture a JPEG from the camera mapped to an attendance reader (Akuvox/DNAKE).
 * Uses go2rtc /api/frame.jpeg when available.
 */
@Injectable()
export class SnapshotCaptureService {
  private readonly logger = new Logger(SnapshotCaptureService.name);
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config
      .get<string>('GO2RTC_BASE_URL', 'http://127.0.0.1:1984')
      .replace(/\/$/, '');
    this.enabled = config.get<string>('GO2RTC_ENABLED', 'true') === 'true';
    this.timeoutMs = Number(config.get<string>('SNAPSHOT_CAPTURE_TIMEOUT_MS', '8000'));
  }

  async captureForReaderDevice(
    readerDeviceId: string,
  ): Promise<{ path: string; buffer: Buffer } | null> {
    if (!this.enabled) {
      this.logger.warn(`Snapshot skipped reader=${readerDeviceId}: go2rtc disabled`);
      return null;
    }

    const mapping = await this.prisma.deviceCameraMapping.findFirst({
      where: { akuvoxDeviceId: readerDeviceId, isDeleted: false },
      include: { cameraDevice: true },
      orderBy: { priority: 'asc' },
    });

    const camera = mapping?.cameraDevice;
    if (!camera || camera.isDeleted || camera.deviceType !== DeviceType.CAMERA) {
      this.logger.warn(
        `No camera mapping for reader=${readerDeviceId} — snapshotPath left null`,
      );
      return null;
    }
    if (!camera.rtspUrl?.trim()) {
      this.logger.warn(`Camera ${camera.code} has no RTSP URL`);
      return null;
    }

    const rtspUrl = buildRtspUrlWithCredentials(
      camera.rtspUrl,
      camera.rtspUsername,
      camera.rtspPassword,
    );
    const streamName = `device_${camera.id}`;

    try {
      await this.upsertStream(streamName, rtspUrl);
      const buffer = await this.fetchFrame(streamName);
      if (!buffer || buffer.length < 100) {
        this.logger.warn(`Empty frame from camera=${camera.code}`);
        return null;
      }
      return {
        path: `snapshots/${readerDeviceId}/${Date.now()}.jpg`,
        buffer,
      };
    } catch (err) {
      this.logger.warn(
        `Snapshot capture failed reader=${readerDeviceId} camera=${camera.code}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return null;
    }
  }

  private async upsertStream(streamName: string, rtspUrl: string) {
    const params = { src: rtspUrl, name: streamName };
    try {
      await firstValueFrom(
        this.http.patch(`${this.baseUrl}/api/streams`, null, {
          params,
          timeout: 5000,
        }),
      );
      return;
    } catch {
      // fall through to PUT
    }
    await firstValueFrom(
      this.http.put(`${this.baseUrl}/api/streams`, null, {
        params,
        timeout: 5000,
      }),
    );
  }

  private async fetchFrame(streamName: string): Promise<Buffer> {
    const response = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/frame.jpeg`, {
        params: { src: streamName },
        responseType: 'arraybuffer',
        timeout: this.timeoutMs,
      }),
    );
    return Buffer.from(response.data as ArrayBuffer);
  }
}

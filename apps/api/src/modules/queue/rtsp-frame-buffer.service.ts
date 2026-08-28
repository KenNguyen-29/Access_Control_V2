import { createHash } from 'crypto';
import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, DeviceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRtspUrlWithCredentials } from '../devices/utils/rtsp-url.util';
import { resolveMockCameraSource } from '../devices/utils/mock-camera.util';
import {
  extractJpegFrames,
  selectClosestFrame,
  TimedJpegFrame,
} from './rtsp-frame-buffer.util';

type PanelConfig = {
  username?: string;
  password?: string;
};

type ReaderDevice = Device & {
  akuvoxMappings: Array<{ cameraDevice: Device }>;
};

type WarmStreamState = {
  abort: AbortController;
  deviceCode: string;
  fingerprint: string;
  frames: TimedJpegFrame[];
  pending: Buffer;
  readyLogged: boolean;
  streamName: string;
};

export type BufferedSnapshot = {
  buffer: Buffer;
  capturedAt: number;
  deltaMs: number;
};

/** Keeps a go2rtc MJPEG consumer open and retains recent frames for attendance events. */
@Injectable()
export class RtspFrameBufferService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RtspFrameBufferService.name);
  private readonly enabled: boolean;
  private readonly go2rtcBase: string;
  private readonly fpsTemplate: string;
  private readonly bufferMs: number;
  private readonly maxFrameAgeMs: number;
  private readonly minJpegBytes: number;
  private readonly reconcileMs: number;
  private readonly restartMs: number;
  private readonly mockCameraEnabled: boolean;
  private readonly mockCameraIp: string;
  private readonly mockCameraSource: string;
  private readonly mockCameraUsername: string;
  private readonly mockCameraPassword: string;
  private readonly states = new Map<string, WarmStreamState>();
  private reconcileTimer?: NodeJS.Timeout;
  private restartTimer?: NodeJS.Timeout;
  private reconciling = false;
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('RTSP_WARM_BUFFER_ENABLED', 'true') === 'true';
    this.go2rtcBase = config
      .get<string>('GO2RTC_BASE_URL', 'http://127.0.0.1:1984')
      .replace(/\/$/, '');
    this.fpsTemplate = config.get<string>('RTSP_WARM_FFMPEG_TEMPLATE', 'mjpeg_fps');
    this.bufferMs = Math.max(1_000, Number(config.get<string>('RTSP_WARM_BUFFER_MS', '3000')));
    this.maxFrameAgeMs = Math.max(
      this.bufferMs,
      Number(config.get<string>('RTSP_WARM_MAX_FRAME_AGE_MS', '5000')),
    );
    this.minJpegBytes = Number(config.get<string>('RTSP_WARM_MIN_JPEG_BYTES', '16000'));
    this.reconcileMs = Math.max(
      5_000,
      Number(config.get<string>('RTSP_WARM_RECONCILE_MS', '15000')),
    );
    this.restartMs = Math.max(
      1_000,
      Number(config.get<string>('RTSP_WARM_RESTART_MS', '3000')),
    );
    this.mockCameraEnabled = config.get<string>('MOCK_CAMERA_ENABLED', 'false') === 'true';
    this.mockCameraIp = config.get<string>('MOCK_CAMERA_IP', '192.168.1.4').trim();
    this.mockCameraSource = config
      .get<string>('MOCK_CAMERA_SOURCE', 'http://127.0.0.1:19084/stream.mjpeg')
      .trim();
    this.mockCameraUsername = config.get<string>('MOCK_CAMERA_USERNAME', '').trim();
    this.mockCameraPassword = config.get<string>('MOCK_CAMERA_PASSWORD', '');
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Persistent RTSP frame buffer disabled');
      return;
    }
    void this.reconcile();
    this.reconcileTimer = setInterval(() => void this.reconcile(), this.reconcileMs);
    this.reconcileTimer.unref?.();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    for (const deviceId of [...this.states.keys()]) this.stop(deviceId, true);
  }

  getClosestFrame(deviceId: string, eventAt?: Date): BufferedSnapshot | null {
    const state = this.states.get(deviceId);
    if (!state) {
      this.logger.debug(`Buffered RTSP miss device=${deviceId}: stream not active`);
      return null;
    }
    if (!state.frames.length) {
      this.logger.debug(`Buffered RTSP miss ${state.deviceCode}: no decoded frame`);
      return null;
    }

    const now = Date.now();
    const requestedAt = eventAt?.getTime();
    const targetAt =
      requestedAt != null &&
      Number.isFinite(requestedAt) &&
      Math.abs(now - requestedAt) <= this.bufferMs * 2
        ? requestedAt
        : now;
    const selected = selectClosestFrame(state.frames, targetAt, now, this.maxFrameAgeMs);
    if (!selected) {
      this.logger.debug(
        `Buffered RTSP miss ${state.deviceCode}: ${state.frames.length} frame(s) are stale`,
      );
      return null;
    }

    return {
      buffer: selected.buffer,
      capturedAt: selected.capturedAt,
      deltaMs: Math.abs(selected.capturedAt - targetAt),
    };
  }

  private async reconcile(): Promise<void> {
    if (this.reconciling || this.shuttingDown || !this.enabled) return;
    this.reconciling = true;
    try {
      const devices = await this.prisma.device.findMany({
        where: {
          isDeleted: false,
          deviceType: { in: [DeviceType.AKUVOX, DeviceType.DNAKE] },
        },
        include: {
          akuvoxMappings: {
            where: { isDeleted: false },
            orderBy: { priority: 'asc' },
            include: { cameraDevice: true },
          },
        },
      });
      const desired = new Map(devices.map((device) => [device.id, device]));

      for (const deviceId of [...this.states.keys()]) {
        if (!desired.has(deviceId)) this.stop(deviceId, true);
      }
      for (const device of desired.values()) {
        await this.ensureStarted(device);
      }
    } catch (err) {
      this.logger.warn(`RTSP warm-buffer reconcile failed: ${this.safeError(err)}`);
      this.scheduleRestart();
    } finally {
      this.reconciling = false;
    }
  }

  private async ensureStarted(device: ReaderDevice): Promise<void> {
    const source = this.sourceForDevice(device);
    if (!source) {
      if (this.states.has(device.id)) this.stop(device.id, true);
      return;
    }
    const fingerprint = createHash('sha256').update(source).digest('hex');
    const current = this.states.get(device.id);
    if (current?.fingerprint === fingerprint && !current.abort.signal.aborted) return;
    if (current) this.stop(device.id, false);

    const streamName = `panel_buffer_${device.id}`;
    const transcodeSource = `ffmpeg:${source}#video=mjpeg#${this.fpsTemplate}`;
    await this.upsertGo2RtcStream(streamName, transcodeSource);
    this.startConsumer(device, streamName, fingerprint);
  }

  private startConsumer(device: Device, streamName: string, fingerprint: string): void {
    const state: WarmStreamState = {
      abort: new AbortController(),
      deviceCode: device.code,
      fingerprint,
      frames: [],
      pending: Buffer.alloc(0),
      readyLogged: false,
      streamName,
    };
    this.states.set(device.id, state);
    this.logger.log(`Starting persistent RTSP frame buffer for ${device.code}`);
    void this.consumeStream(device.id, state);
  }

  private async consumeStream(deviceId: string, state: WarmStreamState): Promise<void> {
    try {
      const response = await fetch(
        `${this.go2rtcBase}/api/stream.mjpeg?src=${encodeURIComponent(state.streamName)}`,
        { signal: state.abort.signal },
      );
      if (!response.ok || !response.body) {
        throw new Error(`go2rtc MJPEG HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      while (!state.abort.signal.aborted) {
        const part = await reader.read();
        if (part.done) throw new Error('go2rtc MJPEG stream ended');
        this.consume(deviceId, state, Buffer.from(part.value));
      }
    } catch (err) {
      if (!state.abort.signal.aborted) {
        this.logger.warn(
          `Persistent RTSP frame buffer failed ${state.deviceCode}: ${this.safeError(err)}`,
        );
      }
    } finally {
      if (this.states.get(deviceId) !== state) return;
      this.states.delete(deviceId);
      if (!this.shuttingDown && !state.abort.signal.aborted) this.scheduleRestart();
    }
  }

  private consume(deviceId: string, state: WarmStreamState, chunk: Buffer): void {
    if (this.states.get(deviceId) !== state) return;
    const combined = Buffer.concat([state.pending, chunk]);
    const parsed = extractJpegFrames(combined);
    state.pending = parsed.remainder.length > 10 * 1024 * 1024 ? Buffer.alloc(0) : parsed.remainder;

    for (const buffer of parsed.frames) {
      if (buffer.length < this.minJpegBytes) continue;
      const capturedAt = Date.now();
      state.frames.push({ buffer, capturedAt });
      const cutoff = capturedAt - this.bufferMs;
      while (state.frames.length && state.frames[0]!.capturedAt < cutoff) state.frames.shift();
      if (state.frames.length > 100) state.frames.splice(0, state.frames.length - 100);
      if (!state.readyLogged) {
        state.readyLogged = true;
        this.logger.log(
          `Persistent RTSP frame buffer ready ${state.deviceCode} bytes=${buffer.length}`,
        );
      }
    }
  }

  private stop(deviceId: string, removeStream: boolean): void {
    const state = this.states.get(deviceId);
    if (!state) return;
    this.states.delete(deviceId);
    state.abort.abort();
    if (removeStream) void this.removeGo2RtcStream(state.streamName);
  }

  private scheduleRestart(): void {
    if (this.restartTimer || this.shuttingDown) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      void this.reconcile();
    }, this.restartMs);
    this.restartTimer.unref?.();
  }

  private sourceForDevice(device: ReaderDevice): string | null {
    const mappedCamera = device.akuvoxMappings
      .map((mapping) => mapping.cameraDevice)
      .find(
        (camera) =>
          !camera.isDeleted &&
          camera.deviceType === DeviceType.CAMERA &&
          Boolean(camera.rtspUrl?.trim()),
      );
    const sourceDevice = mappedCamera ?? device;
    const rtspUrl = sourceDevice.rtspUrl?.trim();
    if (!rtspUrl) return null;
    const config = this.panelConfig(sourceDevice);
    return resolveMockCameraSource(
      buildRtspUrlWithCredentials(
        rtspUrl,
        sourceDevice.rtspUsername?.trim() || config.username?.trim(),
        sourceDevice.rtspPassword || config.password,
      ),
      {
        enabled: this.mockCameraEnabled,
        virtualIp: this.mockCameraIp,
        source: this.mockCameraSource,
        username: this.mockCameraUsername,
        password: this.mockCameraPassword,
      },
    );
  }

  private panelConfig(device: Device): PanelConfig {
    const raw = device.deviceType === DeviceType.DNAKE ? device.dnakeConfig : device.akuvoxConfig;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as PanelConfig;
  }

  private async upsertGo2RtcStream(streamName: string, source: string): Promise<void> {
    const params = { src: source, name: streamName };
    try {
      await firstValueFrom(
        this.http.patch(`${this.go2rtcBase}/api/streams`, null, { params, timeout: 5_000 }),
      );
      return;
    } catch {
      await firstValueFrom(
        this.http.put(`${this.go2rtcBase}/api/streams`, null, { params, timeout: 5_000 }),
      );
    }
  }

  private async removeGo2RtcStream(streamName: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.go2rtcBase}/api/streams`, {
          params: { src: streamName },
          timeout: 3_000,
        }),
      );
    } catch {
      // Stream may already be gone after go2rtc restart.
    }
  }

  private safeError(err: unknown): string {
    if (err instanceof Error) return err.message.replace(/rtsps?:\/\/[^@\s]+@/gi, 'rtsp://***@');
    return 'Unknown error';
  }
}

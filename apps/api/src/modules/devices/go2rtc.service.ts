import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { Go2RtcProcessService } from './go2rtc-process.service';
import { resolveMockCameraSource } from './utils/mock-camera.util';

export interface WebRtcSessionDescription {
  type: string;
  sdp: string;
}

@Injectable()
export class Go2RtcService {
  private readonly logger = new Logger(Go2RtcService.name);
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly mockCameraEnabled: boolean;
  private readonly mockCameraIp: string;
  private readonly mockCameraSource: string;
  private readonly mockCameraUsername: string;
  private readonly mockCameraPassword: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
    private readonly process: Go2RtcProcessService,
  ) {
    this.baseUrl = config
      .get<string>('GO2RTC_BASE_URL', 'http://127.0.0.1:1984')
      .replace(/\/$/, '');
    this.enabled = config.get<string>('GO2RTC_ENABLED', 'true') === 'true';
    this.timeoutMs = Number(config.get<string>('GO2RTC_TIMEOUT_MS', '15000'));
    this.mockCameraEnabled = config.get<string>('MOCK_CAMERA_ENABLED', 'false') === 'true';
    this.mockCameraIp = config.get<string>('MOCK_CAMERA_IP', '192.168.1.4').trim();
    this.mockCameraSource = config
      .get<string>('MOCK_CAMERA_SOURCE', 'http://127.0.0.1:19084/stream.mjpeg')
      .trim();
    this.mockCameraUsername = config.get<string>('MOCK_CAMERA_USERNAME', '').trim();
    this.mockCameraPassword = config.get<string>('MOCK_CAMERA_PASSWORD', '');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  streamNameForDevice(deviceId: string): string {
    return `device_${deviceId}`;
  }

  async upsertStream(streamName: string, rtspUrl: string): Promise<void> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('go2rtc streaming is disabled');
    }

    const ready = await this.process.ensureReady();
    if (!ready) {
      throw new ServiceUnavailableException(
        'go2rtc chưa chạy. Chạy "pnpm --filter @acv2/api go2rtc:install" rồi khởi động lại API, hoặc chạy go2rtc thủ công ở cổng 1984.',
      );
    }

    const resolvedSource = resolveMockCameraSource(rtspUrl, {
      enabled: this.mockCameraEnabled,
      virtualIp: this.mockCameraIp,
      source: this.mockCameraSource,
      username: this.mockCameraUsername,
      password: this.mockCameraPassword,
    });
    // MJPEG is ideal for snapshots but is not a WebRTC video codec. Ask
    // go2rtc/FFmpeg to transcode the virtual source to H.264 for live view.
    const source =
      resolvedSource !== rtspUrl && !/^ffmpeg:/i.test(resolvedSource)
        ? `ffmpeg:${resolvedSource}#video=h264`
        : resolvedSource;
    const params = {
      src: source,
      name: streamName,
    };
    try {
      await firstValueFrom(
        this.http.patch(`${this.baseUrl}/api/streams`, null, {
          params,
          timeout: 5000,
        }),
      );
      return;
    } catch (patchErr) {
      const patchStatus = (patchErr as AxiosError)?.response?.status;
      if (patchStatus && patchStatus !== 404 && patchStatus !== 400) {
        this.logger.warn(
          `go2rtc PATCH stream "${streamName}" failed (${patchStatus}), trying PUT`,
        );
      }
    }

    try {
      await firstValueFrom(
        this.http.put(`${this.baseUrl}/api/streams`, null, {
          params,
          timeout: 5000,
        }),
      );
    } catch (err) {
      const detail = this.describeError(err);
      this.logger.error(`go2rtc upsert stream "${streamName}" failed: ${detail}`);
      throw new ServiceUnavailableException(`Không đăng ký được luồng RTSP vào go2rtc: ${detail}`);
    }
  }

  async probeStream(streamName: string, timeoutMs = 8000): Promise<void> {
    try {
      await firstValueFrom(
        this.http.get(`${this.baseUrl}/api/streams`, {
          params: { src: streamName, video: 'all', audio: 'all' },
          timeout: Math.min(15000, Math.max(1000, timeoutMs)),
        }),
      );
    } catch (err) {
      const detail = this.describeError(err);
      this.logger.error(`go2rtc probe stream "${streamName}" failed: ${detail}`);

      if (/wrong user\/pass/i.test(detail)) {
        throw new ServiceUnavailableException(
          'Sai tài khoản/mật khẩu RTSP của camera. Cập nhật lại trong Quản lý thiết bị và lưu.',
        );
      }
      if (/timeout|timed out|ECONNREFUSED|ENETUNREACH/i.test(detail)) {
        throw new ServiceUnavailableException(`Không kết nối được RTSP của camera: ${detail}`);
      }

      throw new ServiceUnavailableException(`Luồng camera chưa sẵn sàng trong go2rtc: ${detail}`);
    }
  }

  async exchangeWebRtc(
    streamName: string,
    offer: WebRtcSessionDescription,
  ): Promise<WebRtcSessionDescription> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('go2rtc streaming is disabled');
    }

    try {
      const response = await firstValueFrom(
        this.http.post<WebRtcSessionDescription>(
          `${this.baseUrl}/api/webrtc`,
          { type: offer.type, sdp: offer.sdp },
          {
            params: { src: streamName },
            headers: { 'Content-Type': 'application/json' },
            timeout: this.timeoutMs,
          },
        ),
      );

      const contentType = response.headers['content-type'];
      const answer = this.parseWebRtcAnswer(
        response.data,
        typeof contentType === 'string' ? contentType : undefined,
      );
      if (!answer?.sdp) {
        throw new ServiceUnavailableException('go2rtc returned an empty WebRTC answer');
      }

      return answer;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const detail = this.describeError(err);
      this.logger.error(`go2rtc WebRTC "${streamName}" failed: ${detail}`);
      throw new ServiceUnavailableException(`WebRTC handshake failed: ${detail}`);
    }
  }

  private parseWebRtcAnswer(
    data: unknown,
    contentType?: string,
  ): WebRtcSessionDescription | null {
    if (typeof data === 'string' && data.includes('v=0')) {
      return { type: 'answer', sdp: data };
    }
    if (data && typeof data === 'object' && 'sdp' in data) {
      const payload = data as WebRtcSessionDescription;
      return {
        type: payload.type ?? 'answer',
        sdp: payload.sdp,
      };
    }
    if (contentType?.includes('application/sdp') && typeof data === 'string') {
      return { type: 'answer', sdp: data };
    }
    return null;
  }

  async removeStream(streamName: string): Promise<void> {
    if (!this.enabled) return;

    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/api/streams`, {
          params: { src: streamName },
          timeout: 5000,
        }),
      );
    } catch (err) {
      this.logger.warn(`go2rtc delete stream "${streamName}": ${this.describeError(err)}`);
    }
  }

  private describeError(err: unknown): string {
    const sanitize = (value: string) =>
      value.replace(/(rtsps?:\/\/)([^\s/@]+):([^\s/@]*?)@/gi, '$1***:***@');
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const body =
        typeof err.response?.data === 'string'
          ? err.response.data
          : JSON.stringify(err.response?.data ?? {});
      if (status) return sanitize(`HTTP ${status} ${body || err.message}`);
      return sanitize(err.code ?? err.message);
    }
    if (err instanceof Error) return sanitize(err.message);
    return 'Unknown error';
  }
}

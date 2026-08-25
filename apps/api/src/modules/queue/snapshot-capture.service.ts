import { createHash } from 'crypto';
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Device, DeviceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { buildRtspUrlWithCredentials } from '../devices/utils/rtsp-url.util';

const MINI_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=',
  'base64',
);

type PanelConfig = {
  username?: string;
  password?: string;
  protocol?: 'http' | 'https';
};

/**
 * Capture a JPEG from the attendance panel itself (DNAKE / Akuvox) at punch time.
 * Does not require a separate Camera mapping.
 */
@Injectable()
export class SnapshotCaptureService {
  private readonly logger = new Logger(SnapshotCaptureService.name);
  private readonly go2rtcBase: string;
  private readonly go2rtcEnabled: boolean;
  private readonly timeoutMs: number;
  private readonly dnakeMock: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.go2rtcBase = config
      .get<string>('GO2RTC_BASE_URL', 'http://127.0.0.1:1984')
      .replace(/\/$/, '');
    this.go2rtcEnabled = config.get<string>('GO2RTC_ENABLED', 'true') === 'true';
    this.timeoutMs = Number(config.get<string>('SNAPSHOT_CAPTURE_TIMEOUT_MS', '8000'));
    this.dnakeMock = config.get<string>('DNAKE_MOCK_MODE', 'true') === 'true';
  }

  async captureForReaderDevice(
    readerDeviceId: string,
  ): Promise<{ path: string; buffer: Buffer } | null> {
    const device = await this.prisma.device.findFirst({
      where: { id: readerDeviceId, isDeleted: false },
    });
    if (!device) {
      this.logger.warn(`Snapshot skipped: device ${readerDeviceId} not found`);
      return null;
    }
    if (device.deviceType !== DeviceType.AKUVOX && device.deviceType !== DeviceType.DNAKE) {
      this.logger.warn(`Snapshot skipped: ${device.code} is not a face panel`);
      return null;
    }

    let buffer: Buffer | null = null;
    if (device.deviceType === DeviceType.DNAKE) {
      buffer = await this.captureDnakePanel(device);
    }
    if (!buffer) {
      buffer = await this.capturePanelRtsp(device);
    }
    if (!buffer || !this.isJpeg(buffer)) {
      this.logger.warn(
        `No live snapshot from panel ${device.code} (ip=${device.ipAddress ?? '—'} rtsp=${
          device.rtspUrl?.trim() ? 'set' : 'unset'
        } go2rtc=${this.go2rtcEnabled ? 'on' : 'off'})`,
      );
      return null;
    }

    this.logger.log(`Live snapshot OK panel=${device.code} bytes=${buffer.length}`);
    return {
      path: `snapshots/${device.id}/${Date.now()}.jpg`,
      buffer,
    };
  }

  private panelConfig(device: Device): PanelConfig {
    const raw = device.deviceType === DeviceType.DNAKE ? device.dnakeConfig : device.akuvoxConfig;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as PanelConfig;
  }

  private isJpeg(buf: Buffer): boolean {
    return buf.length > 80 && buf[0] === 0xff && buf[1] === 0xd8;
  }

  private async captureDnakePanel(device: Device): Promise<Buffer | null> {
    if (this.dnakeMock) {
      this.logger.debug(`[MOCK] DNAKE snapshot device=${device.code}`);
      return MINI_JPEG;
    }
    if (!device.ipAddress) return null;

    try {
      await this.dnakeJson(device, '/api/v1/system/video/snapshot', 'POST');
    } catch {
      /* some firmwares only support GET */
    }

    const paths = [
      '/api/v1/system/video/snapshot',
      '/api/v1/device/snapshot',
      '/api/v1/system/snapshot',
    ];
    for (const path of paths) {
      try {
        const data = await this.dnakeJson(device, path, 'GET');
        const uri = this.resourceUri(data);
        if (!uri) continue;
        const buf = await this.fetchPanelFile(device, uri);
        if (buf && this.isJpeg(buf)) return buf;
      } catch (err) {
        this.logger.debug(
          `DNAKE snapshot ${path} failed device=${device.code}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return null;
  }

  private resourceUri(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const root = data as { data?: unknown };
    const inner = (
      root.data && typeof root.data === 'object' ? root.data : root
    ) as Record<string, unknown>;
    const uri = inner.resource_uri ?? inner.resourceUri ?? inner.url ?? inner.path;
    return typeof uri === 'string' && uri.trim() ? uri.trim() : null;
  }

  private async dnakeJson(device: Device, path: string, method: 'GET' | 'POST'): Promise<unknown> {
    const url = this.dnakeUrl(device, path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { method, signal: controller.signal });
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private dnakeUrl(device: Device, path: string, extraQuery?: Record<string, string>): string {
    const cfg = this.panelConfig(device);
    const protocol = cfg.protocol || 'http';
    const username = cfg.username?.trim();
    const password = cfg.password?.trim();
    if (!username || !password) {
      throw new Error('DNAKE missing HTTP credentials');
    }
    const base = `${protocol}://${device.ipAddress}`.replace(/\/$/, '');
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const q = new URLSearchParams({
      username,
      password: createHash('md5').update(password, 'utf8').digest('hex'),
      ...(extraQuery ?? {}),
    });
    const sep = normalized.includes('?') ? '&' : '?';
    return `${base}${normalized}${sep}${q.toString()}`;
  }

  private async fetchPanelFile(device: Device, uri: string): Promise<Buffer | null> {
    const cfg = this.panelConfig(device);
    const protocol = cfg.protocol || 'http';
    let url = uri;
    if (uri.startsWith('/')) {
      url = `${protocol}://${device.ipAddress}${uri}`;
    } else if (!/^https?:\/\//i.test(uri)) {
      url = `${protocol}://${device.ipAddress}/${uri.replace(/^\//, '')}`;
    }
    try {
      const withAuth = this.appendDnakeAuth(device, url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(withAuth, { signal: controller.signal });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length > 0 ? buf : null;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  private appendDnakeAuth(device: Device, url: string): string {
    try {
      const parsed = new URL(url);
      const cfg = this.panelConfig(device);
      const username = cfg.username?.trim();
      const password = cfg.password?.trim();
      if (username && password && !parsed.searchParams.has('username')) {
        parsed.searchParams.set('username', username);
        parsed.searchParams.set(
          'password',
          createHash('md5').update(password, 'utf8').digest('hex'),
        );
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private async capturePanelRtsp(device: Device): Promise<Buffer | null> {
    if (!this.go2rtcEnabled) {
      this.logger.warn(`RTSP snapshot skipped ${device.code}: go2rtc disabled`);
      return null;
    }
    const cfg = this.panelConfig(device);
    const username = device.rtspUsername?.trim() || cfg.username?.trim();
    const password = device.rtspPassword || cfg.password;
    const candidates = this.rtspCandidates(device);
    if (candidates.length === 0) {
      this.logger.warn(
        `RTSP snapshot skipped ${device.code}: no rtspUrl and no ipAddress to build default path`,
      );
      return null;
    }
    const errors: string[] = [];
    for (const src of candidates) {
      const rtspUrl = buildRtspUrlWithCredentials(src, username, password);
      const streamName = `panel_${device.id}`;
      try {
        await this.upsertStream(streamName, rtspUrl);
        const buffer = await this.fetchFrame(streamName);
        if (buffer && this.isJpeg(buffer)) {
          this.logger.log(`RTSP frame OK ${device.code} via ${src.split('@').pop() ?? src}`);
          return buffer;
        }
        errors.push(`${src}: empty/non-jpeg frame`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${src}: ${msg}`);
        this.logger.warn(`RTSP snapshot failed ${device.code}: ${msg}`);
      }
    }
    this.logger.warn(`RTSP snapshot exhausted ${device.code}: ${errors.join(' | ')}`);
    return null;
  }

  /** Prefer explicit rtspUrl; otherwise vendor default paths on device IP. */
  private rtspCandidates(device: Device): string[] {
    const explicit = device.rtspUrl?.trim();
    if (explicit) return [explicit];
    const ip = device.ipAddress?.trim();
    if (!ip) return [];
    if (device.deviceType === DeviceType.DNAKE) {
      return [`rtsp://${ip}:554/stream1`, `rtsp://${ip}:554/Streaming/Channels/101`];
    }
    // Akuvox common paths
    return [
      `rtsp://${ip}:554/live/ch00_0`,
      `rtsp://${ip}:554/Streaming/Channels/101`,
      `rtsp://${ip}:554/stream1`,
    ];
  }

  private async upsertStream(streamName: string, rtspUrl: string) {
    const params = { src: rtspUrl, name: streamName };
    try {
      await firstValueFrom(
        this.http.patch(`${this.go2rtcBase}/api/streams`, null, {
          params,
          timeout: 5000,
        }),
      );
      return;
    } catch {
      // fall through to PUT
    }
    await firstValueFrom(
      this.http.put(`${this.go2rtcBase}/api/streams`, null, {
        params,
        timeout: 5000,
      }),
    );
  }

  private async fetchFrame(streamName: string): Promise<Buffer> {
    const response = await firstValueFrom(
      this.http.get(`${this.go2rtcBase}/api/frame.jpeg`, {
        params: { src: streamName },
        responseType: 'arraybuffer',
        timeout: this.timeoutMs,
      }),
    );
    return Buffer.from(response.data as ArrayBuffer);
  }
}

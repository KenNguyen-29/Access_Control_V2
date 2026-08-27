import { randomUUID } from 'crypto';
import { createSocket, type Socket } from 'dgram';
import { networkInterfaces } from 'os';
import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cam } from 'onvif/promises';

export type OnvifProfile = {
  token: string;
  name: string;
  rtspUrl: string;
  width?: number | null;
  height?: number | null;
};

export type OnvifDiscoveryHit = {
  name: string;
  ip: string;
  xaddrs: string[];
  rtspUrls: string[];
  serviceUrl: string;
  onvifPort: number;
  manufacturer?: string;
  model?: string;
  profiles?: OnvifProfile[];
};

export type OnvifProfilesResult = {
  ip: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serviceUrl: string;
  onvifPort: number;
  profiles: OnvifProfile[];
};

type DiscoveryCandidate = {
  ip: string;
  serviceUrl: string;
  name: string;
  manufacturer?: string;
  model?: string;
};

const DISCOVERY_GROUP = '239.255.255.250';
const DISCOVERY_PORT = 3702;
const DEFAULT_ONVIF_PORT = 80;
const DEFAULT_SCAN_TIMEOUT_MS = 5000;
const MIN_SCAN_TIMEOUT_MS = 500;
const MAX_SCAN_TIMEOUT_MS = 15000;
const DEFAULT_PROFILE_TIMEOUT_MS = 15000;
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

@Injectable()
export class OnvifDiscoveryService {
  private readonly logger = new Logger(OnvifDiscoveryService.name);
  private readonly scanTimeoutMs: number;
  private readonly profileTimeoutMs: number;

  constructor(config: ConfigService) {
    this.scanTimeoutMs = this.clamp(
      Number(config.get<string>('ONVIF_SCAN_TIMEOUT_MS', String(DEFAULT_SCAN_TIMEOUT_MS))),
      MIN_SCAN_TIMEOUT_MS,
      MAX_SCAN_TIMEOUT_MS,
      DEFAULT_SCAN_TIMEOUT_MS,
    );
    this.profileTimeoutMs = this.clamp(
      Number(config.get<string>('ONVIF_PROFILE_TIMEOUT_MS', String(DEFAULT_PROFILE_TIMEOUT_MS))),
      3000,
      30000,
      DEFAULT_PROFILE_TIMEOUT_MS,
    );
  }

  async scan(opts?: { timeoutMs?: number }): Promise<OnvifDiscoveryHit[]> {
    const timeoutMs = this.clamp(
      Number(opts?.timeoutMs ?? this.scanTimeoutMs),
      MIN_SCAN_TIMEOUT_MS,
      MAX_SCAN_TIMEOUT_MS,
      this.scanTimeoutMs,
    );
    const interfaces = this.localIpv4Addresses();
    if (!interfaces.length) return [];

    const results = await Promise.all(
      interfaces.map((localIp) => this.scanInterface(localIp, timeoutMs)),
    );
    const byIp = new Map<string, DiscoveryCandidate>();
    for (const candidates of results) {
      for (const candidate of candidates) {
        if (!byIp.has(candidate.ip)) byIp.set(candidate.ip, candidate);
      }
    }
    return [...byIp.values()]
      .sort((a, b) => a.ip.localeCompare(b.ip, 'en'))
      .map((candidate) => {
        const serviceUrl = candidate.serviceUrl;
        return {
          name: candidate.name || candidate.ip,
          ip: candidate.ip,
          xaddrs: serviceUrl ? [serviceUrl] : [],
          rtspUrls: [],
          serviceUrl,
          onvifPort: this.servicePort(serviceUrl),
          manufacturer: candidate.manufacturer,
          model: candidate.model,
          profiles: [],
        };
      });
  }

  async fetchProfiles(input: {
    ip: string;
    serviceUrl?: string;
    username?: string;
    password?: string;
  }): Promise<OnvifProfilesResult> {
    const ip = this.assertCameraIp(input.ip);
    const serviceUrl = this.assertServiceUrl(input.serviceUrl || '', ip);
    const endpoint = serviceUrl || `http://${ip}:${DEFAULT_ONVIF_PORT}/onvif/device_service`;
    const parsed = new URL(endpoint);
    const username = input.username?.trim() || '';
    const password = input.password || '';
    if (username.length > 256 || password.length > 256) {
      throw new BadRequestException('Thông tin xác thực ONVIF quá dài');
    }

    let camera: Cam;
    try {
      camera = new Cam({
        hostname: ip,
        port: parsed.port ? Number(parsed.port) : DEFAULT_ONVIF_PORT,
        path: parsed.pathname || '/onvif/device_service',
        username,
        password,
        timeout: this.profileTimeoutMs,
        preserveAddress: true,
        autoconnect: false,
      });
      await camera.connect();
    } catch (error) {
      this.logger.warn(`ONVIF connect failed for ${ip}: ${this.safeErrorName(error)}`);
      throw new ServiceUnavailableException(
        'Không kết nối được camera ONVIF. Kiểm tra IP, credential và trạng thái camera.',
      );
    }

    let info: Record<string, unknown> = {};
    try {
      info = (await camera.getDeviceInformation()) as Record<string, unknown>;
    } catch (error) {
      this.logger.debug(`ONVIF device information unavailable for ${ip}: ${this.safeErrorName(error)}`);
    }

    let rawProfiles: unknown[] = [];
    try {
      rawProfiles = ((await camera.getProfiles()) || []) as unknown[];
    } catch (error) {
      this.logger.warn(`ONVIF profile listing failed for ${ip}: ${this.safeErrorName(error)}`);
      throw new ServiceUnavailableException(
        'Camera không trả về profile ONVIF. Kiểm tra credential và cấu hình camera.',
      );
    }

    const profiles: OnvifProfile[] = [];
    for (const raw of rawProfiles) {
      const token =
        this.readString(raw, 'token') || this.readString(this.readPath(raw, '$'), 'token');
      if (!token) continue;
      try {
        const response = await (
          camera as unknown as {
            getStreamUri: (options: { protocol: string; profileToken: string }) => Promise<unknown>;
          }
        ).getStreamUri({ protocol: 'RTSP', profileToken: token });
        const rtspUrl = this.cleanRtspUrl(
          this.readString(response, 'uri') ||
            this.readString(response, 'Uri') ||
            this.readString(response, 'mediaUri'),
        );
        if (!rtspUrl) continue;
        profiles.push({
          token,
          name: this.readString(raw, 'name', 'Name') || token,
          rtspUrl,
          width: this.readNumber(raw, 'videoEncoderConfiguration.resolution.width', 'VideoEncoderConfiguration.Resolution.Width'),
          height: this.readNumber(raw, 'videoEncoderConfiguration.resolution.height', 'VideoEncoderConfiguration.Resolution.Height'),
        });
      } catch (error) {
        // A broken vendor profile must not hide other valid profiles.
        this.logger.debug(`ONVIF profile ${token} failed for ${ip}: ${this.safeErrorName(error)}`);
      }
    }
    if (!profiles.length) {
      throw new ServiceUnavailableException(
        'Camera không trả về profile ONVIF có RTSP. Kiểm tra credential và cấu hình camera.',
      );
    }

    const manufacturer = this.readString(info, 'manufacturer', 'Manufacturer') || undefined;
    const model = this.readString(info, 'model', 'Model') || undefined;
    return {
      ip,
      name: [manufacturer, model].filter(Boolean).join(' ').trim() || `Camera ${ip}`,
      manufacturer,
      model,
      serviceUrl: endpoint,
      onvifPort: this.servicePort(endpoint),
      profiles,
    };
  }

  private localIpv4Addresses(): string[] {
    const addresses: string[] = [];
    for (const entries of Object.values(networkInterfaces())) {
      for (const entry of entries || []) {
        const address = entry.address?.trim();
        const isIpv4 = entry.family === 'IPv4' || String(entry.family) === '4';
        if (!isIpv4 || entry.internal || !address || !IPV4.test(address)) continue;
        const first = Number(address.split('.')[0]);
        if (
          first === 127 ||
          first >= 224 ||
          address.startsWith('169.254.') ||
          addresses.includes(address)
        ) {
          continue;
        }
        addresses.push(address);
      }
    }
    return addresses;
  }

  private scanInterface(localIp: string, timeoutMs: number): Promise<DiscoveryCandidate[]> {
    return new Promise((resolve) => {
      const candidates = new Map<string, DiscoveryCandidate>();
      let socket: Socket | null = null;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        try {
          socket?.close();
        } catch {
          // Ignore close races after a socket error.
        }
        resolve([...candidates.values()]);
      };
      const timer = setTimeout(finish, timeoutMs);
      try {
        socket = createSocket({ type: 'udp4', reuseAddr: true });
        socket.on('error', (error) => {
          clearTimeout(timer);
          this.logger.debug(`ONVIF discovery failed on ${localIp}: ${this.safeErrorName(error)}`);
          finish();
        });
        socket.on('message', (message, remote) => {
          const candidate = this.parseDiscoveryResponse(remote.address, message.toString('utf8'));
          if (candidate) candidates.set(candidate.ip, candidate);
        });
        socket.bind(0, localIp, () => {
          try {
            socket?.setBroadcast(true);
            socket?.setMulticastInterface(localIp);
          } catch {
            // The OS may not expose multicast interface selection on every adapter.
          }
          for (const typeElement of ['', '<d:Types>tds:Device</d:Types>', '<d:Types>dn:NetworkVideoTransmitter</d:Types>']) {
            const payload = Buffer.from(this.buildProbe(typeElement), 'utf8');
            socket?.send(payload, 0, payload.length, DISCOVERY_PORT, DISCOVERY_GROUP);
          }
        });
      } catch (error) {
        clearTimeout(timer);
        this.logger.debug(`ONVIF socket failed on ${localIp}: ${this.safeErrorName(error)}`);
        finish();
      }
    });
  }

  private buildProbe(typeElement: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <Header>
    <wsa:MessageID>urn:uuid:${randomUUID()}</wsa:MessageID>
    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
  </Header>
  <Body><d:Probe>${typeElement}</d:Probe></Body>
</Envelope>`;
  }

  private parseDiscoveryResponse(remoteIp: string, xml: string): DiscoveryCandidate | null {
    const xaddrs = this.extractTag(xml, 'XAddrs').split(/\s+/).filter(Boolean);
    if (!xaddrs.length) return null;
    const scopes = this.extractTag(xml, 'Scopes');
    const serviceUrl = xaddrs.find((value) => {
      try {
        return ['http:', 'https:'].includes(new URL(this.decodeXml(value)).protocol);
      } catch {
        return false;
      }
    });
    if (!serviceUrl) return null;
    const decodedUrl = this.decodeXml(serviceUrl);
    let ip = IPV4.test(remoteIp) ? remoteIp : '';
    let normalizedServiceUrl = decodedUrl;
    try {
      const parsed = new URL(decodedUrl);
      const hostname = parsed.hostname;
      if (IPV4.test(hostname)) ip = hostname;
      if (ip && !IPV4.test(hostname)) {
        parsed.hostname = ip;
        normalizedServiceUrl = parsed.toString();
      }
    } catch {
      return null;
    }
    if (!IPV4.test(ip)) return null;
    const name = this.scopeValue(scopes, 'name') || ip;
    const hardware = this.scopeValue(scopes, 'hardware');
    const manufacturerScope = this.scopeValue(scopes, 'manufacturer');
    const manufacturer = this.detectManufacturer([name, hardware, manufacturerScope, decodedUrl].join(' '));
    return {
      ip,
      serviceUrl: normalizedServiceUrl,
      name,
      manufacturer,
      model: hardware || undefined,
    };
  }

  private extractTag(xml: string, tagName: string): string {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = xml.match(new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${escaped}>`, 'i'));
    return match?.[1]?.trim() || '';
  }

  private scopeValue(scopes: string, key: string): string {
    for (const raw of scopes.split(/\s+/)) {
      const decoded = this.decodeXml(raw).replace(/\+/g, ' ');
      const marker = `/${key.toLowerCase()}/`;
      const index = decoded.toLowerCase().indexOf(marker);
      if (index >= 0) {
        const value = decoded.slice(index + marker.length);
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      }
    }
    return '';
  }

  private detectManufacturer(text: string): string {
    const value = text.toLowerCase();
    const brands: Array<[string, string]> = [
      ['hikvision', 'Hikvision'],
      ['ezviz', 'Hikvision'],
      ['dahua', 'Dahua'],
      ['imou', 'Dahua'],
      ['uniview', 'Uniview'],
      ['unv', 'Uniview'],
      ['tiandy', 'Tiandy'],
      ['axis', 'Axis'],
      ['hanwha', 'Hanwha'],
      ['wisenet', 'Hanwha'],
      ['bosch', 'Bosch'],
      ['tenda', 'Tenda'],
      ['tp-link', 'TP-Link'],
    ];
    return brands.find(([needle]) => value.includes(needle))?.[1] || 'ONVIF Camera';
  }

  private readString(value: unknown, ...paths: string[]): string {
    for (const path of paths) {
      const result = this.readPath(value, path);
      if (typeof result === 'string' && result.trim()) return result.trim();
    }
    return '';
  }

  private readNumber(value: unknown, ...paths: string[]): number | null {
    for (const path of paths) {
      const result = Number(this.readPath(value, path));
      if (Number.isFinite(result) && result > 0) return result;
    }
    return null;
  }

  private readPath(value: unknown, path: string): unknown {
    const parts = path.replace(/^\$\./, '').split('.');
    let current: unknown = value;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private cleanRtspUrl(value: string): string {
    if (!value) return '';
    try {
      const url = new URL(value);
      if (!['rtsp:', 'rtsps:'].includes(url.protocol) || !url.hostname) return '';
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return '';
    }
  }

  private assertCameraIp(value: string): string {
    const ip = String(value || '').trim();
    const first = Number(ip.split('.')[0]);
    if (!IPV4.test(ip) || first === 127 || first >= 224) {
      throw new BadRequestException('IP camera không đúng định dạng mạng LAN');
    }
    return ip;
  }

  private assertServiceUrl(value: string, ip: string): string {
    const serviceUrl = String(value || '').trim();
    if (!serviceUrl) return '';
    try {
      const parsed = new URL(serviceUrl);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.hostname !== ip ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error('host mismatch');
      }
      return serviceUrl;
    } catch {
      throw new BadRequestException('ONVIF service URL phải trỏ đúng IP thiết bị');
    }
  }

  private servicePort(serviceUrl: string): number {
    try {
      const port = new URL(serviceUrl).port;
      const parsed = port ? Number(port) : DEFAULT_ONVIF_PORT;
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
        ? parsed
        : DEFAULT_ONVIF_PORT;
    } catch {
      return DEFAULT_ONVIF_PORT;
    }
  }

  private decodeXml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private clamp(value: number, min: number, max: number, fallback: number): number {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  }

  private safeErrorName(error: unknown): string {
    return error instanceof Error ? error.constructor.name : 'UnknownError';
  }
}

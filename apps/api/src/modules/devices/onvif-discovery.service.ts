import { createSocket, type Socket } from 'dgram';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OnvifDiscoveryHit = {
  name: string;
  ip: string;
  xaddrs: string[];
  rtspUrls: string[];
  manufacturer?: string;
  model?: string;
};

const WS_PROBE = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
  xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:acv2-onvif-probe</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;

/**
 * WS-Discovery (ONVIF) on LAN to find panels/cameras and suggest RTSP URLs.
 * Multicast requires the API process to reach the LAN (host network / not isolated bridge).
 */
@Injectable()
export class OnvifDiscoveryService {
  private readonly logger = new Logger(OnvifDiscoveryService.name);
  private readonly defaultTimeoutMs: number;

  constructor(config: ConfigService) {
    this.defaultTimeoutMs = Number(config.get<string>('ONVIF_SCAN_TIMEOUT_MS', '4000'));
  }

  async scan(opts?: {
    timeoutMs?: number;
    username?: string;
    password?: string;
  }): Promise<OnvifDiscoveryHit[]> {
    const timeoutMs = Math.min(15000, Math.max(1500, opts?.timeoutMs ?? this.defaultTimeoutMs));
    const probes = await this.wsDiscovery(timeoutMs);
    const byIp = new Map<string, OnvifDiscoveryHit>();

    for (const probe of probes) {
      const ip = probe.ip;
      if (!ip || byIp.has(ip)) continue;
      let rtspUrls = this.defaultRtspCandidates(ip);
      let manufacturer = probe.manufacturer;
      let model = probe.model;
      let name = probe.name || ip;

      if (probe.xaddrs[0] && opts?.username && opts?.password) {
        try {
          const enriched = await this.fetchStreamUris(
            probe.xaddrs[0],
            opts.username,
            opts.password,
            timeoutMs,
          );
          if (enriched.rtspUrls.length) rtspUrls = enriched.rtspUrls;
          if (enriched.manufacturer) manufacturer = enriched.manufacturer;
          if (enriched.model) model = enriched.model;
          if (enriched.name) name = enriched.name;
        } catch (err) {
          this.logger.debug(
            `ONVIF media probe failed ${ip}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      byIp.set(ip, {
        name,
        ip,
        xaddrs: probe.xaddrs,
        rtspUrls,
        manufacturer,
        model,
      });
    }

    return [...byIp.values()].sort((a, b) => a.ip.localeCompare(b.ip, 'en'));
  }

  private wsDiscovery(timeoutMs: number): Promise<
    Array<{
      ip: string;
      xaddrs: string[];
      name?: string;
      manufacturer?: string;
      model?: string;
    }>
  > {
    return new Promise((resolve) => {
      const hits: Array<{
        ip: string;
        xaddrs: string[];
        name?: string;
        manufacturer?: string;
        model?: string;
      }> = [];
      const seen = new Set<string>();

      let socket: Socket;
      try {
        socket = createSocket({ type: 'udp4', reuseAddr: true });
      } catch (err) {
        this.logger.warn(`ONVIF UDP socket failed: ${err instanceof Error ? err.message : err}`);
        resolve([]);
        return;
      }

      const finish = () => {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        resolve(hits);
      };

      const timer = setTimeout(finish, timeoutMs);

      socket.on('error', (err) => {
        this.logger.warn(`ONVIF discovery error: ${err.message}`);
        clearTimeout(timer);
        finish();
      });

      socket.on('message', (msg, rinfo) => {
        const xml = msg.toString('utf8');
        const xaddrs = this.extractAll(xml, /<(?:\w+:)?XAddrs>([^<]+)<\/(?:\w+:)?XAddrs>/gi);
        const scopes = this.extractAll(xml, /<(?:\w+:)?Scopes>([^<]+)<\/(?:\w+:)?Scopes>/gi).join(
          ' ',
        );
        const ips = new Set<string>();
        if (rinfo.address && !rinfo.address.startsWith('127.')) ips.add(rinfo.address);
        for (const xa of xaddrs) {
          for (const part of xa.split(/\s+/)) {
            try {
              const u = new URL(part.trim());
              if (u.hostname) ips.add(u.hostname);
            } catch {
              /* ignore */
            }
          }
        }
        for (const ip of ips) {
          if (seen.has(ip)) continue;
          seen.add(ip);
          hits.push({
            ip,
            xaddrs: xaddrs.flatMap((x) => x.split(/\s+/).map((s) => s.trim()).filter(Boolean)),
            name: this.scopeValue(scopes, 'name') || ip,
            manufacturer: this.scopeValue(scopes, 'hardware') || this.scopeValue(scopes, 'name'),
            model: this.scopeValue(scopes, 'hardware'),
          });
        }
      });

      socket.bind(() => {
        try {
          socket.setBroadcast(true);
          socket.setMulticastTTL(4);
        } catch {
          /* ignore */
        }
        const buf = Buffer.from(WS_PROBE, 'utf8');
        socket.send(buf, 0, buf.length, 3702, '239.255.255.250', (err) => {
          if (err) {
            this.logger.warn(`ONVIF probe send failed: ${err.message}`);
            clearTimeout(timer);
            finish();
          }
        });
      });
    });
  }

  private extractAll(xml: string, re: RegExp): string[] {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(xml))) {
      if (m[1]) out.push(m[1].trim());
    }
    return out;
  }

  private scopeValue(scopes: string, key: string): string | undefined {
    const re = new RegExp(`onvif://www\\.onvif\\.org/${key}/([^\\s]+)`, 'i');
    const m = scopes.match(re);
    if (!m?.[1]) return undefined;
    try {
      return decodeURIComponent(m[1].replace(/\+/g, ' '));
    } catch {
      return m[1];
    }
  }

  private defaultRtspCandidates(ip: string): string[] {
    return [
      `rtsp://${ip}:554/Streaming/Channels/101`,
      `rtsp://${ip}:554/live/ch00_0`,
      `rtsp://${ip}:554/stream1`,
      `rtsp://${ip}:554/cam/realmonitor?channel=1&subtype=0`,
    ];
  }

  private async fetchStreamUris(
    xaddr: string,
    username: string,
    password: string,
    timeoutMs: number,
  ): Promise<{ rtspUrls: string[]; name?: string; manufacturer?: string; model?: string }> {
    const mediaUrl = xaddr.includes('/onvif/')
      ? xaddr
      : `${xaddr.replace(/\/$/, '')}/onvif/device_service`;

    // GetProfiles via media service is more reliable after GetCapabilities; try common media URL.
    const mediaCandidates = [
      mediaUrl.replace(/device_service/i, 'media_service'),
      mediaUrl.replace(/device_service/i, 'Media'),
      `${new URL(xaddr).origin}/onvif/media_service`,
      xaddr,
    ];

    for (const endpoint of mediaCandidates) {
      try {
        const profilesXml = await this.soapPost(
          endpoint,
          username,
          password,
          this.getProfilesBody(),
          timeoutMs,
        );
        const tokens = this.extractAll(
          profilesXml,
          /<(?:\w+:)?Profile[^>]*token="([^"]+)"/gi,
        );
        const rtspUrls: string[] = [];
        for (const token of tokens.slice(0, 3)) {
          try {
            const uriXml = await this.soapPost(
              endpoint,
              username,
              password,
              this.getStreamUriBody(token),
              timeoutMs,
            );
            const uris = this.extractAll(uriXml, /<(?:\w+:)?Uri>([^<]+)<\/(?:\w+:)?Uri>/gi);
            for (const u of uris) {
              if (/^rtsps?:\/\//i.test(u) && !rtspUrls.includes(u)) rtspUrls.push(u);
            }
          } catch {
            /* try next profile */
          }
        }
        if (rtspUrls.length) return { rtspUrls };
      } catch {
        /* try next endpoint */
      }
    }
    return { rtspUrls: [] };
  }

  private getProfilesBody(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
  <s:Body><trt:GetProfiles/></s:Body>
</s:Envelope>`;
  }

  private getStreamUriBody(profileToken: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
  xmlns:tt="http://www.onvif.org/ver10/schema">
  <s:Body>
    <trt:GetStreamUri>
      <trt:StreamSetup>
        <tt:Stream>RTP-Unicast</tt:Stream>
        <tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>
      </trt:StreamSetup>
      <trt:ProfileToken>${profileToken}</trt:ProfileToken>
    </trt:GetStreamUri>
  </s:Body>
</s:Envelope>`;
  }

  private async soapPost(
    url: string,
    username: string,
    password: string,
    body: string,
    timeoutMs: number,
  ): Promise<string> {
    const auth = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          Authorization: `Basic ${auth}`,
        },
        body,
        signal: controller.signal,
      });
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractClientIp } from './akuvox-door-log.util';

@Injectable()
export class AkuvoxWebhookSecurityService {
  constructor(private readonly config: ConfigService) {}

  assertRequestAllowed(params: {
    remoteAddress?: string;
    forwardedFor?: string | string[];
    headerToken?: string;
    queryToken?: string;
  }): string {
    const clientIp = extractClientIp(params.remoteAddress, params.forwardedFor);
    this.assertIpAllowed(clientIp);
    this.assertTokenAllowed(params.headerToken, params.queryToken);
    return clientIp;
  }

  getWebhookUrl(): string {
    const base = this.config.get<string>('API_PUBLIC_URL', 'http://localhost:8080').replace(/\/$/, '');
    return `${base}/api/akuvox/door_log`;
  }

  private assertIpAllowed(clientIp: string) {
    const raw = this.config.get<string>('AKUVOX_ALLOWED_IPS', '');
    const allowed = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (allowed.length === 0) return;
    if (!allowed.includes(clientIp)) {
      throw new ForbiddenException('Forbidden source IP');
    }
  }

  private assertTokenAllowed(headerToken?: string, queryToken?: string) {
    const configured = this.config.get<string>('AKUVOX_WEBHOOK_TOKEN', '').trim();
    if (!configured) return;
    const provided = (headerToken || queryToken || '').trim();
    if (provided !== configured) {
      throw new UnauthorizedException('Invalid webhook token');
    }
  }
}

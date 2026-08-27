import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SETTING_KEY } from '../system-settings/system-setting-keys';
import { extractClientIp } from './akuvox-door-log.util';
import {
  resolveApiPublicBaseUrl,
  resolveApiPublicBaseUrlForTarget,
} from '../../common/utils/network.util';

type PublicRequest = {
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AkuvoxWebhookSecurityService {
  constructor(
    private readonly config: ConfigService,
    private readonly settings: SystemSettingsService,
  ) {}

  async assertRequestAllowed(params: {
    remoteAddress?: string;
    forwardedFor?: string | string[];
    headerToken?: string;
    queryToken?: string;
  }): Promise<string> {
    const clientIp = extractClientIp(params.remoteAddress, params.forwardedFor);
    await this.assertIpAllowed(clientIp);
    await this.assertTokenAllowed(params.headerToken, params.queryToken);
    return clientIp;
  }

  getWebhookUrl(request?: PublicRequest): string {
    const resolved = resolveApiPublicBaseUrl(this.config);
    // Prefer the detected server address. A direct browser request often has
    // the FE proxy's host (for example localhost:3003), which a panel cannot
    // call. A real reverse proxy is still honoured through x-forwarded-host.
    return this.buildWebhookUrl(resolved.url, resolved.configured, request, false);
  }

  /** Resolve the callback address using the OS route to one specific panel. */
  async getWebhookUrlForDevice(deviceIp: string, request?: PublicRequest): Promise<string> {
    const resolved = await resolveApiPublicBaseUrlForTarget(this.config, deviceIp);
    return this.buildWebhookUrl(resolved.url, resolved.configured, request, false);
  }

  private buildWebhookUrl(
    resolvedUrl: string,
    configured: boolean,
    request?: PublicRequest,
    preferRequestOrigin = true,
  ): string {
    const forwardedHost = this.firstHeader(request?.headers?.['x-forwarded-host']);
    const requestHost = preferRequestOrigin
      ? forwardedHost || this.firstHeader(request?.headers?.host)
      : forwardedHost;
    const forwardedProtocol = this.firstHeader(request?.headers?.['x-forwarded-proto']);
    const protocol = forwardedProtocol || request?.protocol || resolvedUrl.split(':')[0];
    // When the UI is served through a reverse proxy, returning the request
    // origin makes the generated URL usable from that same network path.
    const base = !configured && requestHost
      ? `${protocol}://${requestHost}`
      : resolvedUrl;
    return `${base}/api/akuvox/door_log`;
  }

  async getIntegrationInfo(request?: PublicRequest) {
    const [token, allowedIps, mockMode] = await Promise.all([
      this.settings.getRaw(SETTING_KEY.AKUVOX_WEBHOOK_TOKEN),
      this.settings.getRaw(SETTING_KEY.AKUVOX_ALLOWED_IPS),
      this.settings.getBoolean(SETTING_KEY.AKUVOX_MOCK_MODE, false),
    ]);
    const envToken = this.config.get<string>('AKUVOX_WEBHOOK_TOKEN', '').trim();
    const envIps = this.config.get<string>('AKUVOX_ALLOWED_IPS', '');
    const envMock = this.config.get<string>('AKUVOX_MOCK_MODE', 'false') === 'true';

    return {
      webhookUrl: this.getWebhookUrl(request),
      tokenConfigured: Boolean((token && token.trim()) || envToken),
      allowedIps: (allowedIps ?? envIps) || '',
      mockMode: mockMode || envMock,
      source: {
        token: token && token.trim() ? 'db' : envToken ? 'env' : 'none',
        ips: allowedIps != null && allowedIps !== '' ? 'db' : envIps ? 'env' : 'none',
      },
    };
  }

  private firstHeader(value: string | string[] | undefined): string | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    return first?.split(',')[0]?.trim() || undefined;
  }

  private async resolveAllowedIps(): Promise<string[]> {
    const fromDb = await this.settings.getRaw(SETTING_KEY.AKUVOX_ALLOWED_IPS);
    const raw =
      fromDb != null && fromDb !== ''
        ? fromDb
        : this.config.get<string>('AKUVOX_ALLOWED_IPS', '');
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private async resolveToken(): Promise<string> {
    const fromDb = await this.settings.getRaw(SETTING_KEY.AKUVOX_WEBHOOK_TOKEN);
    if (fromDb != null && fromDb.trim()) return fromDb.trim();
    return this.config.get<string>('AKUVOX_WEBHOOK_TOKEN', '').trim();
  }

  private async assertIpAllowed(clientIp: string) {
    const allowed = await this.resolveAllowedIps();
    if (allowed.length === 0) return;
    if (!allowed.includes(clientIp)) {
      throw new ForbiddenException('Forbidden source IP');
    }
  }

  private async assertTokenAllowed(headerToken?: string, queryToken?: string) {
    const configured = await this.resolveToken();
    if (!configured) return;
    const provided = (headerToken || queryToken || '').trim();
    if (provided !== configured) {
      throw new UnauthorizedException('Invalid webhook token');
    }
  }
}

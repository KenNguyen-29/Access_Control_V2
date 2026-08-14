import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { successResponse } from '../../common/utils/response.util';
import {
  AkuvoxDoorLogPayload,
  buildDoorLogFromMap,
  isFaceDoorLogEvent,
  parseDoorLogJson,
  parseFormEncodedPayload,
} from './akuvox-door-log.util';
import { AkuvoxWebhookSecurityService } from './akuvox-webhook-security.service';
import { WebhooksService } from './webhooks.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

@ApiTags('akuvox')
@Controller()
export class AkuvoxDoorLogController {
  private readonly logger = new Logger(AkuvoxDoorLogController.name);

  constructor(
    private readonly webhooks: WebhooksService,
    private readonly security: AkuvoxWebhookSecurityService,
  ) {}

  @Public()
  @Post(['akuvox/door_log', 'door_log'])
  @HttpCode(HttpStatus.OK)
  async receiveDoorLogPost(
    @Req() req: RequestWithRawBody,
    @Body() body: Record<string, unknown> | undefined,
    @Query() query: Record<string, string>,
    @Headers('x-akuvox-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ) {
    return this.handleDoorLog(req, body, query, headerToken, queryToken, false);
  }

  @Public()
  @Get(['akuvox/door_log', 'door_log'])
  @HttpCode(HttpStatus.OK)
  async receiveDoorLogGet(
    @Req() req: RequestWithRawBody,
    @Query() query: Record<string, string>,
    @Headers('x-akuvox-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ) {
    return this.handleDoorLog(req, undefined, query, headerToken, queryToken, true);
  }

  private async handleDoorLog(
    req: RequestWithRawBody,
    body: Record<string, unknown> | undefined,
    query: Record<string, string>,
    headerToken: string | undefined,
    queryToken: string | undefined,
    isProbe: boolean,
  ) {
    const clientIp = await this.security.assertRequestAllowed({
      remoteAddress: req.socket.remoteAddress,
      forwardedFor: req.headers['x-forwarded-for'],
      headerToken,
      queryToken,
    });

    const payload = this.parsePayload(req, body, query);
    if (!payload) {
      if (isProbe) {
        return successResponse({ probe: true }, 'Webhook reachable');
      }
      return { success: false, message: 'Missing or unsupported payload format' };
    }

    this.logger.log(
      `Door log ${req.method} clientIp=${clientIp} Type=${payload.Type ?? '—'} UserID=${payload.UserID ?? '—'} Status=${payload.Status ?? '—'}`,
    );

    if (!isFaceDoorLogEvent(payload)) {
      return successResponse({
        ignored: true,
        reason: 'UNSUPPORTED_TYPE',
      });
    }

    const deviceCode =
      query.deviceCode?.trim() ||
      query.device?.trim() ||
      query.DeviceCode?.trim() ||
      query.mac?.trim() ||
      undefined;

    const result = await this.webhooks.processDoorLog(payload, clientIp, deviceCode);
    return successResponse(result);
  }

  private parsePayload(
    req: RequestWithRawBody,
    body: Record<string, unknown> | undefined,
    query: Record<string, string>,
  ): AkuvoxDoorLogPayload | null {
    const raw = req.rawBody?.length
      ? req.rawBody.toString('utf8')
      : typeof body === 'object' && body && Object.keys(body).length > 0
        ? JSON.stringify(body)
        : '';

    const fromJson = parseDoorLogJson(raw);
    if (fromJson) return fromJson;

    const fromQuery = buildDoorLogFromMap(query);
    if (fromQuery) return fromQuery;

    if (body && typeof body === 'object') {
      const fromBody = buildDoorLogFromMap(
        Object.fromEntries(
          Object.entries(body).map(([key, value]) => [key, value == null ? '' : String(value)]),
        ),
      );
      if (fromBody) return fromBody;
    }

    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (raw && (contentType.includes('form') || raw.includes('='))) {
      return buildDoorLogFromMap(parseFormEncodedPayload(raw));
    }

    return null;
  }
}

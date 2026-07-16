import {
  Body,
  Controller,
  Get,
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
import { normalizeAkuvoxWebhookPayload } from './akuvox-webhook.util';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly service: WebhooksService) {}

  @Public()
  @Get('akuvox')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleAkuvoxGet(@Query() query: Record<string, string>, @Req() req: Request) {
    return this.handleAkuvoxEvent(req, undefined, query);
  }

  @Public()
  @Post('akuvox')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleAkuvoxPost(
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
    @Req() req: Request,
  ) {
    return this.handleAkuvoxEvent(req, body, query);
  }

  private async handleAkuvoxEvent(
    req: Request,
    body?: Record<string, unknown>,
    query?: Record<string, string>,
  ) {
    const payload = normalizeAkuvoxWebhookPayload(body, query, req.originalUrl);
    const sourceIp = req.ip || req.socket.remoteAddress;
    this.logger.log(
      `Akuvox webhook ${req.method} employee=${payload.employeeCode ?? '—'} device=${payload.deviceCode ?? payload.deviceIp ?? '—'}`,
    );
    const result = await this.service.enqueueAkuvoxEvent(payload, sourceIp);
    return successResponse(result, 'Event queued for processing');
  }
}

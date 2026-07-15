import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AkuvoxWebhookPayload } from '@acv2/shared';
import { Public } from '../../common/decorators/public.decorator';
import { successResponse } from '../../common/utils/response.util';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Public()
  @Post('akuvox')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleAkuvox(@Body() payload: AkuvoxWebhookPayload, @Req() req: Request) {
    const sourceIp = req.ip || req.socket.remoteAddress;
    const result = await this.service.enqueueAkuvoxEvent(payload, sourceIp);
    return successResponse(result, 'Event queued for processing');
  }
}

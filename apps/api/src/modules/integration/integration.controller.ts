import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { successResponse } from '../../common/utils/response.util';
import { isRedisEnabled } from '../../common/utils/redis.util';
import { HealthService } from '../health/health.service';
import { AkuvoxWebhookSecurityService } from '../webhooks/akuvox-webhook-security.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SETTING_KEY } from '../system-settings/system-setting-keys';
import type { Request } from 'express';

@ApiTags('integration')
@ApiBearerAuth()
@Controller('integration')
export class IntegrationController {
  constructor(
    private readonly webhookSecurity: AkuvoxWebhookSecurityService,
    private readonly health: HealthService,
    private readonly config: ConfigService,
    private readonly settings: SystemSettingsService,
  ) {}

  @Get('status')
  async status(@Req() request: Request) {
    const [akuvox, health, mockMode] = await Promise.all([
      this.webhookSecurity.getIntegrationInfo(request),
      this.health.check(),
      this.settings.getBoolean(SETTING_KEY.AKUVOX_MOCK_MODE, false),
    ]);
    const envMock = this.config.get<string>('AKUVOX_MOCK_MODE', 'false') === 'true';

    return successResponse({
      akuvox: {
        ...akuvox,
        mockMode: mockMode || envMock,
      },
      redis: {
        enabled: isRedisEnabled(),
        status: health.checks.redis,
        host: this.config.get<string>('REDIS_HOST', '127.0.0.1'),
        port: this.config.get<string>('REDIS_PORT', '6379'),
        note: 'Kết nối Redis cấu hình qua biến môi trường (REDIS_*); UI chỉ xem trạng thái.',
      },
      queue: health.queue,
    });
  }
}

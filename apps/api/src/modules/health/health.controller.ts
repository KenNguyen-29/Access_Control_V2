import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { successResponse } from '../../common/utils/response.util';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  /** Public liveness — minimal status only (no infra details). */
  @Public()
  @Get()
  async check() {
    const detailed = await this.service.check();
    const ok = detailed.status === 'ok';
    return successResponse({
      status: ok ? 'ok' : 'degraded',
      timestamp: detailed.timestamp,
    });
  }

  /** Detailed health for authenticated operators. */
  @ApiBearerAuth()
  @Get('detailed')
  async detailed() {
    const status = await this.service.check();
    return successResponse(status);
  }
}

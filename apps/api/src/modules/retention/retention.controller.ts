import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../../common/utils/response.util';
import { RetentionService } from './retention.service';

@ApiTags('retention')
@ApiBearerAuth()
@Controller('retention')
export class RetentionController {
  constructor(private readonly service: RetentionService) {}

  @Post('run')
  async runNow() {
    return successResponse(await this.service.runPurge('manual'), 'Retention purge completed');
  }
}

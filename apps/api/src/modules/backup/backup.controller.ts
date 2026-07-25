import { Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../../common/utils/response.util';
import { BackupService } from './backup.service';

@ApiTags('backup')
@ApiBearerAuth()
@Controller('backup')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  @Get('status')
  async status() {
    return successResponse(await this.service.getStatus());
  }

  @Post('run')
  async runNow(@Req() _req: unknown) {
    return successResponse(await this.service.runBackup('manual'), 'Backup completed');
  }

  @Post('reschedule')
  async reschedule() {
    await this.service.rescheduleFromSettings();
    return successResponse(await this.service.getStatus(), 'Backup schedule updated');
  }
}

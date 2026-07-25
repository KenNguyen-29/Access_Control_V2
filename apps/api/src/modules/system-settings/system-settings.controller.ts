import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';
import { successResponse } from '../../common/utils/response.util';
import { SystemSettingsService } from './system-settings.service';

class UpsertSettingDto {
  @IsString()
  value!: string;
}

class AccessZoneSchedulesDto {
  @IsObject()
  schedules!: Record<string, string>;
}

@ApiTags('system-settings')
@ApiBearerAuth()
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  async findAll() {
    return successResponse(await this.service.findAll());
  }

  @Get('groups/access-zone-schedules')
  async getSchedules() {
    return successResponse(await this.service.getAccessZoneSchedules());
  }

  @Put('groups/access-zone-schedules')
  async putSchedules(
    @Body() dto: AccessZoneSchedulesDto,
    @Req() req: { user?: { userId?: string } },
  ) {
    return successResponse(
      await this.service.putAccessZoneSchedules(dto.schedules, req.user?.userId),
      'Schedules updated',
    );
  }

  @Get(':key')
  async findByKey(@Param('key') key: string) {
    return successResponse(await this.service.findByKey(key));
  }

  @Put(':key')
  async upsert(
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
    @Req() req: { user?: { userId?: string } },
  ) {
    return successResponse(
      await this.service.upsert(key, dto.value, req.user?.userId),
      'Setting saved',
    );
  }
}

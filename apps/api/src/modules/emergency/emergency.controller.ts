import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmergencySafeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { successResponse } from '../../common/utils/response.util';
import { EmergencyService } from './emergency.service';

class FireWebhookDto {
  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateMusterDto {
  @IsEnum(EmergencySafeStatus)
  safeStatus!: EmergencySafeStatus;

  @IsOptional()
  @IsString()
  remarks?: string;
}

@ApiTags('emergency')
@Controller('emergency')
export class EmergencyController {
  constructor(private readonly service: EmergencyService) {}

  @Public()
  @Post('webhook/fire')
  async fireWebhook(@Body() dto: FireWebhookDto) {
    return successResponse(
      await this.service.handleFireWebhook(dto.description),
      'Fire emergency started',
    );
  }

  @ApiBearerAuth()
  @Get('dashboard')
  async dashboard(@Query('eventId') eventId?: string) {
    return successResponse(await this.service.getDashboard(eventId));
  }

  @ApiBearerAuth()
  @Patch('muster/:id')
  async updateMuster(
    @Param('id') id: string,
    @Body() dto: UpdateMusterDto,
    @Req() req: { user?: { userId?: string } },
  ) {
    return successResponse(
      await this.service.markSafe(id, dto.safeStatus, req.user?.userId, dto.remarks),
      'Muster updated',
    );
  }

  @ApiBearerAuth()
  @Post(':eventId/end')
  async end(@Param('eventId') eventId: string) {
    return successResponse(await this.service.endEmergency(eventId), 'Emergency ended');
  }

  /** Drill helper — same as webhook but authenticated */
  @ApiBearerAuth()
  @Post('drill')
  async drill(@Body() dto: FireWebhookDto) {
    return successResponse(
      await this.service.handleFireWebhook(dto.description ?? 'FACP drill'),
      'Drill started',
    );
  }
}

import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { successResponse } from '../../common/utils/response.util';
import { PermissionsService } from './permissions.service';

class AssignPermissionDto {
  @IsString()
  userId!: string;

  @IsString()
  zoneId!: string;

  @IsOptional()
  @Type(() => Date)
  validFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  validTo?: Date;
}

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  async findAll(
    @Query('userId') userId?: string,
    @Query('zoneId') zoneId?: string,
  ) {
    return successResponse(await this.service.findAll(userId, zoneId));
  }

  @Get('user/:userId/summary')
  async userSummary(@Param('userId') userId: string) {
    return successResponse(await this.service.getUserAccessSummary(userId));
  }

  @Get('check')
  async check(@Query('userId') userId: string, @Query('zoneId') zoneId: string) {
    return successResponse(await this.service.checkAccess(userId, zoneId));
  }

  @Post()
  async assign(@Body() dto: AssignPermissionDto) {
    return successResponse(await this.service.assign(dto), 'Permission assigned');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return successResponse(null, 'Permission removed');
  }
}

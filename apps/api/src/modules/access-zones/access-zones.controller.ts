import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { successResponse } from '../../common/utils/response.util';
import { AccessZonesService } from './access-zones.service';

class CreateAccessZoneDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parentZoneId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateAccessZoneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  parentZoneId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@ApiTags('access-zones')
@ApiBearerAuth()
@Controller('access-zones')
export class AccessZonesController {
  constructor(private readonly service: AccessZonesService) {}

  @Get()
  async findAll(@Query('search') search?: string) {
    return successResponse(await this.service.findAll(search));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return successResponse(await this.service.findOne(id));
  }

  @Post()
  async create(@Body() dto: CreateAccessZoneDto) {
    return successResponse(await this.service.create(dto), 'Zone created');
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccessZoneDto) {
    return successResponse(await this.service.update(id, dto), 'Zone updated');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return successResponse(null, 'Zone deleted');
  }
}

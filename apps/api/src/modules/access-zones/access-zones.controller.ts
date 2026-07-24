import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { successResponse } from '../../common/utils/response.util';
import { AccessZonesService } from './access-zones.service';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

class CreateAccessZoneDto {
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên khu vực' })
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  parentZoneId?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class UpdateAccessZoneDto {
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  parentZoneId?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
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

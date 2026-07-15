import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../../common/utils/response.util';
import { DeviceMappingsService } from './device-mappings.service';
import { CreateDeviceMappingDto } from './dto/create-device-mapping.dto';

@ApiTags('device-mappings')
@ApiBearerAuth()
@Controller('device-mappings')
export class DeviceMappingsController {
  constructor(private readonly service: DeviceMappingsService) {}

  @Get()
  async findAll(@Query('akuvoxDeviceId') akuvoxDeviceId?: string) {
    return successResponse(await this.service.findAll(akuvoxDeviceId));
  }

  @Post()
  async create(@Body() dto: CreateDeviceMappingDto) {
    return successResponse(await this.service.create(dto), 'Mapping created');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return successResponse(null, 'Mapping deleted');
  }
}

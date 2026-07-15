import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { paginatedResponse, successResponse } from '../../common/utils/response.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { DevicesService } from './devices.service';
import { AkuvoxService } from './akuvox.service';
import { DeviceWebRtcService } from './device-webrtc.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { WebRtcOfferDto } from './dto/webrtc-offer.dto';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly service: DevicesService,
    private readonly akuvox: AkuvoxService,
    private readonly webrtc: DeviceWebRtcService,
  ) {}

  @Get()
  async findAll(@Query() query: PaginationDto) {
    const result = await this.service.findAll(query);
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return successResponse(await this.service.findOne(id));
  }

  @Post(':id/webrtc')
  async webrtcExchange(@Param('id') id: string, @Body() dto: WebRtcOfferDto) {
    return successResponse(await this.webrtc.exchange(id, dto));
  }

  @Post()
  async create(@Body() dto: CreateDeviceDto) {
    return successResponse(await this.service.create(dto), 'Device created');
  }

  @Post('users/:userId/sync')
  async syncUser(
    @Param('userId') userId: string,
    @Body() body: { zoneId?: string },
  ) {
    return successResponse(
      await this.akuvox.syncUserCredentials(userId, body?.zoneId),
      'User credentials synced',
    );
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return successResponse(await this.service.update(id, dto), 'Device updated');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return successResponse(null, 'Device deleted');
  }

  @Post(':id/open-door')
  async openDoor(@Param('id') id: string) {
    return successResponse(await this.akuvox.openDoor(id), 'Door open command sent');
  }

  @Post(':id/sync-credentials')
  async syncCredentials(@Param('id') id: string) {
    return successResponse(await this.akuvox.syncCredentials(id), 'Credentials synced');
  }

  @Post(':id/test-connection')
  async testConnection(@Param('id') id: string) {
    const result = await this.service.testConnection(id);
    return successResponse(
      result,
      result.online ? 'Thiết bị đang kết nối' : 'Không kết nối được tới thiết bị',
    );
  }
}

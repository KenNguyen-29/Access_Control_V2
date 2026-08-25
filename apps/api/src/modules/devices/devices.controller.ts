import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DeviceType } from '@prisma/client';
import { paginatedResponse, successResponse } from '../../common/utils/response.util';
import { DevicesService } from './devices.service';
import { AkuvoxService } from './akuvox.service';
import { DnakeService } from './dnake.service';
import { DeviceWebRtcService } from './device-webrtc.service';
import { OnvifDiscoveryService } from './onvif-discovery.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DevicesQueryDto } from './dto/devices-query.dto';
import { WebRtcOfferDto } from './dto/webrtc-offer.dto';
import { AkuvoxWebhookSecurityService } from '../webhooks/akuvox-webhook-security.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProjectScopeService } from '../../common/services/project-scope.service';
import type { JwtPayload } from '../auth/jwt.strategy';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly service: DevicesService,
    private readonly akuvox: AkuvoxService,
    private readonly dnake: DnakeService,
    private readonly webrtc: DeviceWebRtcService,
    private readonly onvif: OnvifDiscoveryService,
    private readonly webhookSecurity: AkuvoxWebhookSecurityService,
    private readonly webhooks: WebhooksService,
    private readonly prisma: PrismaService,
    private readonly projectScope: ProjectScopeService,
  ) {}

  private liveScope(user?: JwtPayload) {
    return this.projectScope.scopeFromLiveUser(user);
  }

  @Get('akuvox/webhook-info')
  getAkuvoxWebhookInfo() {
    return successResponse({
      webhookUrl: this.webhookSecurity.getWebhookUrl(),
      note: 'Cấu hình URL này trên Akuvox (HTTP push / door log). Thiết bị được map theo IP client.',
    });
  }

  @Post('onvif/scan')
  async scanOnvif(
    @Body()
    body?: {
      timeoutMs?: number;
      username?: string;
      password?: string;
    },
  ) {
    const items = await this.onvif.scan({
      timeoutMs: body?.timeoutMs,
      username: body?.username?.trim() || undefined,
      password: body?.password || undefined,
    });
    return successResponse(
      { items, count: items.length },
      items.length
        ? `Tìm thấy ${items.length} thiết bị ONVIF`
        : 'Không thấy thiết bị ONVIF (kiểm tra LAN / host network)',
    );
  }

  @Post('akuvox/test-door-log')
  async testAkuvoxDoorLog(@Body() body: { userId?: string; deviceIp?: string }) {
    const userId = body.userId?.trim() || 'NV-0003';
    const deviceIp = body.deviceIp?.trim() || '192.168.71.186';
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8);

    const result = await this.webhooks.processDoorLog(
      {
        Type: 'Face',
        Status: 'Success',
        UserID: userId,
        Date: date,
        Time: time,
        Name: 'Test User',
      },
      deviceIp,
    );

    return successResponse(result, 'Test door_log dispatched');
  }

  @Get()
  async findAll(@Query() query: DevicesQueryDto, @CurrentUser() user?: JwtPayload) {
    const scope = await this.liveScope(user);
    const result = await this.service.findAll(query, scope);
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    const scope = await this.liveScope(user);
    return successResponse(await this.service.findOne(id, scope));
  }

  @Post(':id/webrtc')
  async webrtcExchange(
    @Param('id') id: string,
    @Body() dto: WebRtcOfferDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const scope = await this.liveScope(user);
    await this.service.assertAccessible(id, scope);
    return successResponse(await this.webrtc.exchange(id, dto));
  }

  @Post()
  async create(@Body() dto: CreateDeviceDto, @CurrentUser() user?: JwtPayload) {
    const scope = await this.liveScope(user);
    return successResponse(await this.service.create(dto, scope), 'Device created');
  }

  @Post('users/:userId/sync')
  async syncUser(
    @Param('userId') userId: string,
    @Body() body: { zoneId?: string },
  ) {
    const [akuvox, dnake] = await Promise.all([
      this.akuvox.syncUserCredentials(userId, body?.zoneId).catch((err) => ({
        synced: 0,
        devices: 0,
        results: [],
        error: err instanceof Error ? err.message : 'akuvox sync failed',
      })),
      this.dnake.syncUserCredentials(userId, body?.zoneId).catch((err) => ({
        synced: 0,
        devices: 0,
        results: [],
        error: err instanceof Error ? err.message : 'dnake sync failed',
      })),
    ]);
    return successResponse({ akuvox, dnake }, 'User credentials synced');
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const scope = await this.liveScope(user);
    return successResponse(await this.service.update(id, dto, scope), 'Device updated');
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    const scope = await this.liveScope(user);
    const result = await this.service.remove(id, scope);
    return successResponse(result, 'Đã xóa thiết bị');
  }

  @Post(':id/open-door')
  async openDoor(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    const scope = await this.liveScope(user);
    await this.service.assertAccessible(id, scope);
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
      select: { deviceType: true },
    });
    if (!device) {
      throw new BadRequestException('Device not found');
    }
    if (device.deviceType === DeviceType.DNAKE) {
      throw new BadRequestException('DNAKE S414L chưa hỗ trợ mở cửa từ xa qua API');
    }
    return successResponse(await this.akuvox.openDoor(id), 'Door open command sent');
  }

  @Post(':id/sync-credentials')
  async syncCredentials(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    const scope = await this.liveScope(user);
    await this.service.assertAccessible(id, scope);
    const device = await this.prisma.device.findFirst({
      where: { id, isDeleted: false },
      select: { deviceType: true },
    });
    if (!device) {
      throw new BadRequestException('Device not found');
    }
    if (device.deviceType === DeviceType.DNAKE) {
      return successResponse(await this.dnake.syncCredentials(id), 'Credentials synced');
    }
    return successResponse(await this.akuvox.syncCredentials(id), 'Credentials synced');
  }

  @Post(':id/test-connection')
  async testConnection(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    const scope = await this.liveScope(user);
    await this.service.assertAccessible(id, scope);
    const result = await this.service.testConnection(id);
    return successResponse(
      result,
      result.online ? 'Thiết bị đang kết nối' : 'Không kết nối được tới thiết bị',
    );
  }
}

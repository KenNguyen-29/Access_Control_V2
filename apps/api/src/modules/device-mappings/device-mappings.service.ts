import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeviceMappingDto } from './dto/create-device-mapping.dto';

@Injectable()
export class DeviceMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(akuvoxDeviceId?: string) {
    return this.prisma.deviceCameraMapping.findMany({
      where: {
        isDeleted: false,
        ...(akuvoxDeviceId ? { akuvoxDeviceId } : {}),
      },
      include: {
        akuvoxDevice: true,
        cameraDevice: true,
      },
      orderBy: { priority: 'asc' },
    });
  }

  async create(dto: CreateDeviceMappingDto) {
    const reader = await this.prisma.device.findFirst({
      where: { id: dto.akuvoxDeviceId, isDeleted: false },
    });
    if (!reader) throw new NotFoundException('Không tìm thấy đầu đọc');
    if (reader.deviceType !== DeviceType.AKUVOX && reader.deviceType !== DeviceType.DNAKE) {
      throw new BadRequestException('Đầu đọc phải là thiết bị Akuvox hoặc DNAKE');
    }
    const camera = await this.prisma.device.findFirst({
      where: { id: dto.cameraDeviceId, isDeleted: false, deviceType: DeviceType.CAMERA },
    });
    if (!camera) throw new BadRequestException('Camera không hợp lệ');

    return this.prisma.deviceCameraMapping.create({
      data: dto,
      include: { akuvoxDevice: true, cameraDevice: true },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.deviceCameraMapping.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Không tìm thấy liên kết');
    }
    return this.prisma.deviceCameraMapping.delete({ where: { id } });
  }
}

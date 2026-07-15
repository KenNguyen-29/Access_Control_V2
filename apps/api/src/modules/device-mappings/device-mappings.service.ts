import { Injectable } from '@nestjs/common';
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

  create(dto: CreateDeviceMappingDto) {
    return this.prisma.deviceCameraMapping.create({
      data: dto,
      include: { akuvoxDevice: true, cameraDevice: true },
    });
  }

  async remove(id: string) {
    return this.prisma.deviceCameraMapping.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}

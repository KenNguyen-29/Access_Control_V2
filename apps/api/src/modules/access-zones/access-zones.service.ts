import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AccessZonesService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { name: string; parentZoneId?: string; description?: string }) {
    return this.prisma.accessZone.create({ data });
  }

  async findAll(search?: string) {
    return this.prisma.accessZone.findMany({
      where: {
        isDeleted: false,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { parentZone: true, childZones: { where: { isDeleted: false } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.accessZone.findFirst({
      where: { id, isDeleted: false },
      include: { parentZone: true, childZones: { where: { isDeleted: false } } },
    });
    if (!item) throw new NotFoundException('Zone not found');
    return item;
  }

  async update(
    id: string,
    data: { name?: string; parentZoneId?: string | null; description?: string },
  ) {
    await this.findOne(id);
    return this.prisma.accessZone.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.accessZone.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.role.findFirst({
      where: { id, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Không tìm thấy vai trò');
    return row;
  }
}

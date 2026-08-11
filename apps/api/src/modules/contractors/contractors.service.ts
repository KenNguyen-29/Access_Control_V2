import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';

@Injectable()
export class ContractorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.contractor.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, projectLinks: true } } },
    });
    return rows.map((c) => ({
      ...c,
      _count: {
        users: c._count.users,
        projects: c._count.projectLinks,
      },
    }));
  }

  async findOne(id: string) {
    const row = await this.prisma.contractor.findFirst({
      where: { id, isDeleted: false },
      include: {
        projectLinks: {
          include: { project: true },
          orderBy: { project: { name: 'asc' } },
        },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy nhà thầu');
    return {
      ...row,
      projects: row.projectLinks
        .map((l) => l.project)
        .filter((p) => !p.isDeleted),
    };
  }

  create(dto: CreateContractorDto) {
    return this.prisma.contractor.create({ data: dto });
  }

  async update(id: string, dto: UpdateContractorDto) {
    await this.findOne(id);
    return this.prisma.contractor.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.contractor.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}

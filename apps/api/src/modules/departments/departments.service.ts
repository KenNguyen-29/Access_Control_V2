import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.department.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, isDeleted: false },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({ data: dto });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.department.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}

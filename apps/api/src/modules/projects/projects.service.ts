import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const projectInclude = {
  contractors: {
    include: { contractor: true },
    orderBy: { contractor: { name: 'asc' as const } },
  },
  _count: { select: { users: true } },
} as const;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(contractorId?: string, scopeProjectIds: string[] | null = null) {
    const scopeFilter =
      scopeProjectIds === null
        ? {}
        : scopeProjectIds.length === 0
          ? { id: { in: [] as string[] } }
          : { id: { in: scopeProjectIds } };

    return this.prisma.project.findMany({
      where: {
        isDeleted: false,
        ...scopeFilter,
        ...(contractorId
          ? { contractors: { some: { contractorId } } }
          : {}),
      },
      include: projectInclude,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.project.findFirst({
      where: { id, isDeleted: false },
      include: projectInclude,
    });
    if (!row) throw new NotFoundException('Không tìm thấy dự án');
    return row;
  }

  private async assertContractorsExist(contractorIds: string[]) {
    if (contractorIds.length === 0) return;
    const found = await this.prisma.contractor.findMany({
      where: { id: { in: contractorIds }, isDeleted: false },
      select: { id: true },
    });
    if (found.length !== contractorIds.length) {
      throw new BadRequestException('Một hoặc nhiều nhà thầu không tồn tại');
    }
  }

  async create(dto: CreateProjectDto) {
    const contractorIds = [...new Set(dto.contractorIds ?? [])];
    await this.assertContractorsExist(contractorIds);

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          code: dto.code,
          siteName: dto.siteName,
          description: dto.description,
        },
      });
      if (contractorIds.length > 0) {
        await tx.projectContractor.createMany({
          data: contractorIds.map((contractorId) => ({
            projectId: project.id,
            contractorId,
          })),
        });
      }
      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: projectInclude,
      });
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);

    const { contractorIds: rawIds, ...rest } = dto;
    const replaceLinks = rawIds !== undefined;
    const contractorIds = replaceLinks ? [...new Set(rawIds ?? [])] : null;
    if (contractorIds) {
      await this.assertContractorsExist(contractorIds);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: rest,
      });
      if (contractorIds) {
        await tx.projectContractor.deleteMany({ where: { projectId: id } });
        if (contractorIds.length > 0) {
          await tx.projectContractor.createMany({
            data: contractorIds.map((contractorId) => ({
              projectId: id,
              contractorId,
            })),
          });
        }
      }
      return tx.project.findUniqueOrThrow({
        where: { id },
        include: projectInclude,
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.project.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}

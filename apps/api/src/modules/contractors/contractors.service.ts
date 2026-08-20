import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { TransferContractorProjectDto } from './dto/transfer-contractor-project.dto';
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

  async create(dto: CreateContractorDto) {
    const code = dto.code || (await this.generateCode('NT'));
    return this.prisma.contractor.create({ data: { ...dto, code } });
  }

  private async generateCode(prefix: string): Promise<string> {
    const count = await this.prisma.contractor.count();
    const seq = String(count + 1).padStart(4, '0');
    const base = `${prefix}${seq}`;
    const exists = await this.prisma.contractor.findUnique({ where: { code: base } });
    if (!exists) return base;
    return `${prefix}${Date.now().toString(36).toUpperCase()}`;
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

  /** Move contractor link from one project to another; update NV thuộc dự án nguồn. */
  async transferProject(contractorId: string, dto: TransferContractorProjectDto) {
    if (dto.fromProjectId === dto.toProjectId) {
      throw new BadRequestException('Dự án nguồn và đích phải khác nhau');
    }

    await this.findOne(contractorId);

    const fromLink = await this.prisma.projectContractor.findFirst({
      where: { contractorId, projectId: dto.fromProjectId },
    });
    if (!fromLink) {
      throw new BadRequestException('Nhà thầu không thuộc dự án nguồn');
    }

    const toProject = await this.prisma.project.findFirst({
      where: { id: dto.toProjectId, isDeleted: false },
    });
    if (!toProject) {
      throw new BadRequestException('Dự án đích không tồn tại');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.projectContractor.delete({ where: { id: fromLink.id } });

      const existingTarget = await tx.projectContractor.findFirst({
        where: { contractorId, projectId: dto.toProjectId },
      });
      if (!existingTarget) {
        await tx.projectContractor.create({
          data: { contractorId, projectId: dto.toProjectId },
        });
      }

      const usersUpdated = await tx.user.updateMany({
        where: {
          contractorId,
          projectId: dto.fromProjectId,
          isDeleted: false,
        },
        data: { projectId: dto.toProjectId },
      });

      return {
        contractorId,
        fromProjectId: dto.fromProjectId,
        toProjectId: dto.toProjectId,
        usersMoved: usersUpdated.count,
      };
    });
  }
}

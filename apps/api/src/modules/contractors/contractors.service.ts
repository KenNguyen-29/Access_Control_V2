import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { TransferContractorProjectDto } from './dto/transfer-contractor-project.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';

@Injectable()
export class ContractorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    opts: { search?: string; page?: number; pageSize?: number } = {},
    scopeProjectIds: string[] | null = null,
  ) {
    const search = opts.search?.trim();
    const scopeFilter =
      scopeProjectIds === null
        ? {}
        : {
            projectLinks: {
              some: {
                projectId: { in: scopeProjectIds },
              },
            },
          };
    const where = {
      isDeleted: false,
      ...scopeFilter,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const mapRow = <
      T extends {
        _count: { users: number; projectLinks: number };
      },
    >(
      c: T,
    ) => ({
      ...c,
      _count: {
        users: c._count.users,
        projects: c._count.projectLinks,
      },
    });

    if (opts.page != null) {
      const page = Math.max(1, opts.page);
      const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 10));
      const [rows, total] = await Promise.all([
        this.prisma.contractor.findMany({
          where,
          orderBy: { name: 'asc' },
          include: { _count: { select: { users: true, projectLinks: true } } },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.contractor.count({ where }),
      ]);
      return { items: rows.map(mapRow), total, page, pageSize };
    }

    const rows = await this.prisma.contractor.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, projectLinks: true } } },
    });
    return rows.map(mapRow);
  }

  async findOne(id: string, scopeProjectIds: string[] | null = null) {
    const row = await this.prisma.contractor.findFirst({
      where: {
        id,
        isDeleted: false,
        ...(scopeProjectIds === null
          ? {}
          : {
              projectLinks: {
                some: { projectId: { in: scopeProjectIds } },
              },
            }),
      },
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

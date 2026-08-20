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

  private async withContractorUserCounts<
    T extends {
      id: string;
      contractors: Array<{ contractorId: string }>;
    },
  >(rows: T[]) {
    if (rows.length === 0) return rows.map((row) => ({
      ...row,
      contractors: row.contractors.map((link) => ({ ...link, userCount: 0 })),
    }));

    const counts = await this.prisma.user.groupBy({
      by: ['projectId', 'contractorId'],
      where: {
        isDeleted: false,
        projectId: { in: rows.map((r) => r.id) },
        contractorId: { not: null },
      },
      _count: { _all: true },
    });
    const countMap = new Map(
      counts.map((c) => [`${c.projectId}:${c.contractorId ?? ''}`, c._count._all]),
    );

    return rows.map((row) => ({
      ...row,
      contractors: row.contractors.map((link) => ({
        ...link,
        userCount: countMap.get(`${row.id}:${link.contractorId}`) ?? 0,
      })),
    }));
  }

  async findAll(
    opts: {
      contractorId?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    } = {},
    scopeProjectIds: string[] | null = null,
  ) {
    const scopeFilter =
      scopeProjectIds === null
        ? {}
        : scopeProjectIds.length === 0
          ? { id: { in: [] as string[] } }
          : { id: { in: scopeProjectIds } };

    const search = opts.search?.trim();
    const where = {
      isDeleted: false,
      ...scopeFilter,
      ...(opts.contractorId ? { contractors: { some: { contractorId: opts.contractorId } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
              { siteName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    if (opts.page != null) {
      const page = Math.max(1, opts.page);
      const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 10));
      const [rows, total] = await Promise.all([
        this.prisma.project.findMany({
          where,
          include: projectInclude,
          orderBy: { name: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.project.count({ where }),
      ]);
      const items = await this.withContractorUserCounts(rows);
      return { items, total, page, pageSize };
    }

    const rows = await this.prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: { name: 'asc' },
    });
    return this.withContractorUserCounts(rows);
  }

  async findOne(id: string) {
    const row = await this.prisma.project.findFirst({
      where: { id, isDeleted: false },
      include: projectInclude,
    });
    if (!row) throw new NotFoundException('Không tìm thấy dự án');
    const [withCounts] = await this.withContractorUserCounts([row]);
    return withCounts;
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

  private async generateProjectCode(): Promise<string> {
    const count = await this.prisma.project.count();
    const seq = String(count + 1).padStart(4, '0');
    const base = `DA${seq}`;
    const exists = await this.prisma.project.findUnique({ where: { code: base } });
    if (!exists) return base;
    return `DA${Date.now().toString(36).toUpperCase()}`;
  }

  async create(dto: CreateProjectDto) {
    const contractorIds = [...new Set(dto.contractorIds ?? [])];
    await this.assertContractorsExist(contractorIds);
    const code = dto.code || (await this.generateProjectCode());

    const created = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          code,
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
    const [withCounts] = await this.withContractorUserCounts([created]);
    return withCounts;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);

    const { contractorIds: rawIds, ...rest } = dto;
    const replaceLinks = rawIds !== undefined;
    const contractorIds = replaceLinks ? [...new Set(rawIds ?? [])] : null;
    if (contractorIds) {
      await this.assertContractorsExist(contractorIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
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
    const [withCounts] = await this.withContractorUserCounts([updated]);
    return withCounts;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.project.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}

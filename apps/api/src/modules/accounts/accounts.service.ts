import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { rolesRequiringProjects } from '@acv2/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsQueryDto, CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

const accountInclude = {
  role: true,
  projectLinks: {
    include: { project: true },
    orderBy: { project: { name: 'asc' as const } },
  },
} as const;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapAccount(row: {
    id: string;
    username: string;
    isActive: boolean;
    isDeleted: boolean;
    mustChangePassword: boolean;
    passwordChangedAt: Date | null;
    createdAt: Date;
    role: { id: string; name: string; code: UserRole };
    projectLinks: Array<{ projectId: string; project: { id: string; name: string; code: string } }>;
  }) {
    return {
      id: row.id,
      username: row.username,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
      passwordChangedAt: row.passwordChangedAt,
      createdAt: row.createdAt,
      role: row.role,
      projectIds: row.projectLinks.map((l) => l.projectId),
      projects: row.projectLinks.map((l) => l.project),
    };
  }

  private async assertRoleAndProjects(roleId: string, projectIds: string[]) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, isDeleted: false },
    });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');

    if (rolesRequiringProjects(role.code) && projectIds.length === 0) {
      throw new BadRequestException('Vai trò này bắt buộc gán ít nhất một dự án');
    }

    if (projectIds.length > 0) {
      const found = await this.prisma.project.findMany({
        where: { id: { in: projectIds }, isDeleted: false },
        select: { id: true },
      });
      if (found.length !== projectIds.length) {
        throw new BadRequestException('Một hoặc nhiều dự án không tồn tại');
      }
    }

    return role;
  }

  async findAll(query: AccountsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(100, query.pageSize ?? 20);
    const where = {
      isDeleted: false,
      ...(query.search
        ? { username: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        include: accountInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { username: 'asc' },
      }),
      this.prisma.account.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.mapAccount(r)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.account.findFirst({
      where: { id, isDeleted: false },
      include: accountInclude,
    });
    if (!row) throw new NotFoundException('Không tìm thấy tài khoản');
    return this.mapAccount(row);
  }

  async create(dto: CreateAccountDto) {
    const projectIds = [...new Set(dto.projectIds ?? [])];
    await this.assertRoleAndProjects(dto.roleId, projectIds);

    const existing = await this.prisma.account.findUnique({
      where: { username: dto.username },
    });
    if (existing && !existing.isDeleted) {
      throw new ConflictException('Username đã tồn tại');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          username: dto.username,
          passwordHash,
          roleId: dto.roleId,
          isActive: dto.isActive ?? true,
          mustChangePassword: true,
        },
      });
      if (projectIds.length) {
        await tx.accountProject.createMany({
          data: projectIds.map((projectId) => ({ accountId: account.id, projectId })),
        });
      }
      const full = await tx.account.findUniqueOrThrow({
        where: { id: account.id },
        include: accountInclude,
      });
      return this.mapAccount(full);
    });
  }

  async update(id: string, dto: UpdateAccountDto, actorId: string) {
    const existing = await this.prisma.account.findFirst({
      where: { id, isDeleted: false },
      include: { role: true, projectLinks: true },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy tài khoản');

    const roleId = dto.roleId ?? existing.roleId;
    const projectIds =
      dto.projectIds !== undefined
        ? [...new Set(dto.projectIds)]
        : existing.projectLinks.map((l) => l.projectId);

    const role = await this.assertRoleAndProjects(roleId, projectIds);

    if (dto.isActive === false && id === actorId) {
      throw new ForbiddenException('Không thể tự vô hiệu hóa tài khoản của mình');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id },
        data: {
          ...(dto.roleId ? { roleId: dto.roleId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.mustChangePassword !== undefined
            ? { mustChangePassword: dto.mustChangePassword }
            : {}),
          ...(dto.password
            ? {
                passwordHash: await bcrypt.hash(dto.password, 12),
                mustChangePassword: dto.mustChangePassword ?? true,
                passwordChangedAt: new Date(),
              }
            : {}),
        },
      });

      if (dto.projectIds !== undefined || dto.roleId) {
        await tx.accountProject.deleteMany({ where: { accountId: id } });
        if (projectIds.length) {
          await tx.accountProject.createMany({
            data: projectIds.map((projectId) => ({ accountId: id, projectId })),
          });
        }
      }

      const full = await tx.account.findUniqueOrThrow({
        where: { id },
        include: accountInclude,
      });
      return this.mapAccount(full);
    });
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) {
      throw new ForbiddenException('Không thể xóa tài khoản của chính mình');
    }
    await this.findOne(id);
    await this.prisma.account.update({
      where: { id },
      data: { isDeleted: true, isActive: false },
    });
  }
}

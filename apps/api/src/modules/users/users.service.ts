import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersIdsQueryDto, UsersQueryDto } from './dto/users-query.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private buildWhere(query: { search?: string; departmentId?: string }) {
    return {
      isDeleted: false,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' as const } },
              { employeeCode: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  /** Attach a public URL for the face image stored on disk (path in PostgreSQL). */
  private async withFaceUrl<T extends { faceImagePath: string | null }>(user: T) {
    let faceImageUrl: string | null = null;
    if (user.faceImagePath) {
      try {
        faceImageUrl = await this.storage.getAssetUrl(user.faceImagePath);
      } catch {
        faceImageUrl = null;
      }
    }
    return { ...user, faceImageUrl };
  }

  async findAll(query: UsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(query);

    const [rawItems, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { department: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = await Promise.all(rawItems.map((u) => this.withFaceUrl(u)));
    return { items, total, page, pageSize };
  }

  async findIds(query: UsersIdsQueryDto) {
    const where = this.buildWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      include: { department: true, credentials: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.withFaceUrl(user);
  }

  async create(dto: CreateUserDto) {
    const user = await this.prisma.user.create({
      data: dto,
      include: { department: true },
    });
    return this.withFaceUrl(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      include: { department: true },
    });
    return this.withFaceUrl(user);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}

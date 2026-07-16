import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AkuvoxService } from '../devices/akuvox.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { UsersIdsQueryDto, UsersQueryDto } from './dto/users-query.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly permissions: PermissionsService,
    private readonly akuvox: AkuvoxService,
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

  private async nextEmployeeCode() {
    const prefix = (this.config.get<string>('EMPLOYEE_CODE_PREFIX', 'NV') || 'NV').trim();
    const codePrefix = `${prefix}-`;
    const last = await this.prisma.user.findFirst({
      where: {
        employeeCode: {
          startsWith: codePrefix,
        },
      },
      select: { employeeCode: true },
      orderBy: { employeeCode: 'desc' },
    });
    const current = last?.employeeCode ?? '';
    const match = current.match(new RegExp(`^${prefix}-(\\d+)$`));
    const next = Number(match?.[1] ?? '0') + 1;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  async create(dto: CreateUserDto) {
    const trimmedCode = dto.employeeCode?.trim();
    const baseData = {
      ...dto,
      employeeCode: trimmedCode || undefined,
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const user = await this.prisma.user.create({
          data: {
            ...baseData,
            employeeCode: baseData.employeeCode || (await this.nextEmployeeCode()),
          },
          include: { department: true },
        });
        return this.withFaceUrl(user);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const fields = Array.isArray(err.meta?.target)
            ? err.meta?.target.join(', ')
            : String(err.meta?.target ?? '');
          if (fields.includes('employeeCode')) {
            if (baseData.employeeCode) {
              throw new ConflictException('Mã nhân viên đã tồn tại');
            }
            continue;
          }
        }
        throw err;
      }
    }

    throw new ConflictException('Không thể tự sinh mã nhân viên, vui lòng thử lại');
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

  /** Assign access zones and optionally push FaceID to each zone's Akuvox. */
  async provision(userId: string, dto: ProvisionUserDto) {
    await this.findOne(userId);
    const zoneIds = [...new Set(dto.zoneIds.filter(Boolean))];
    if (zoneIds.length === 0) {
      throw new BadRequestException('Cần ít nhất một khu vực');
    }

    const zones = await this.prisma.accessZone.findMany({
      where: { id: { in: zoneIds }, isDeleted: false },
      select: { id: true, name: true },
    });
    if (zones.length !== zoneIds.length) {
      throw new BadRequestException('Một hoặc nhiều khu vực không tồn tại');
    }

    for (const zoneId of zoneIds) {
      await this.permissions.assign({ userId, zoneId });
    }

    const autoSync = dto.autoSync !== false;
    const syncByZone: Array<{
      zoneId: string;
      zoneName: string;
      synced: number;
      devices: number;
      results: Array<{
        deviceId: string;
        deviceName: string;
        zoneId: string | null;
        zoneName?: string;
        ok: boolean;
        error?: string;
      }>;
      mock?: boolean;
    }> = [];

    if (autoSync) {
      for (const zone of zones) {
        try {
          const result = await this.akuvox.syncUserCredentials(userId, zone.id);
          syncByZone.push({
            zoneId: zone.id,
            zoneName: zone.name,
            synced: result.synced,
            devices: result.devices,
            results: result.results ?? [],
            mock: result.mock,
          });
        } catch (err) {
          syncByZone.push({
            zoneId: zone.id,
            zoneName: zone.name,
            synced: 0,
            devices: 0,
            results: [
              {
                deviceId: zone.id,
                deviceName: zone.name,
                zoneId: zone.id,
                zoneName: zone.name,
                ok: false,
                error: err instanceof Error ? err.message : 'Đồng bộ thất bại',
              },
            ],
          });
        }
      }
    }

    return {
      userId,
      zoneIds,
      autoSync,
      syncByZone,
      synced: syncByZone.reduce((n, z) => n + z.synced, 0),
    };
  }
}

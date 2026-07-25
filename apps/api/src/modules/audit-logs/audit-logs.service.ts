import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    pageSize?: number;
    from?: string;
    to?: string;
    actorId?: string;
    entity?: string;
    action?: string;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
        to.setHours(23, 59, 59, 999);
      }
      createdAt.lte = to;
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.entity ? { entity: { contains: query.entity, mode: 'insensitive' } } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}

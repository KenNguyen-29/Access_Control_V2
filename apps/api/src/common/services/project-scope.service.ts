import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../modules/auth/jwt.strategy';

export type ProjectScope = string[] | null;

@Injectable()
export class ProjectScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** null = all projects (admin); [] = no access; string[] = scoped */
  scopeFromUser(user?: JwtPayload): ProjectScope {
    if (!user) return [];
    if (user.role === 'ADMIN') return null;
    return user.projectIds ?? [];
  }

  async scopeFromLiveUser(user?: JwtPayload): Promise<ProjectScope> {
    if (!user?.sub) return this.scopeFromUser(user);
    const account = await this.prisma.account.findFirst({
      where: { id: user.sub, isActive: true, isDeleted: false },
      include: {
        role: { select: { code: true } },
        projectLinks: { select: { projectId: true } },
      },
    });
    if (!account) return [];
    if (account.role.code === 'ADMIN') return null;
    return account.projectLinks.map((link) => link.projectId);
  }

  async loadProjectIdsForAccount(accountId: string, role: string): Promise<string[] | null> {
    if (role === 'ADMIN') return null;
    const links = await this.prisma.accountProject.findMany({
      where: { accountId },
      select: { projectId: true },
    });
    return links.map((l) => l.projectId);
  }

  assertProjectInScope(scope: ProjectScope, projectId?: string | null) {
    if (!projectId || scope === null) return;
    if (!scope.includes(projectId)) {
      throw new ForbiddenException('Dự án ngoài phạm vi được phép');
    }
  }

  mergeProjectFilter(
    scope: ProjectScope,
    requestedProjectId?: string,
  ): { projectId?: string | { in: string[] } } {
    if (scope === null) {
      return requestedProjectId ? { projectId: requestedProjectId } : {};
    }
    if (scope.length === 0) {
      return { projectId: { in: [] } };
    }
    if (requestedProjectId) {
      if (!scope.includes(requestedProjectId)) {
        throw new ForbiddenException('Dự án ngoài phạm vi được phép');
      }
      return { projectId: requestedProjectId };
    }
    return { projectId: { in: scope } };
  }

  mergeProjectIdList(scope: ProjectScope, requestedProjectId?: string): string[] | undefined {
    if (scope === null) return requestedProjectId ? [requestedProjectId] : undefined;
    if (scope.length === 0) return [];
    if (requestedProjectId) {
      if (!scope.includes(requestedProjectId)) {
        throw new ForbiddenException('Dự án ngoài phạm vi được phép');
      }
      return [requestedProjectId];
    }
    return scope;
  }
}

'use client';

import { useMemo } from 'react';
import {
  canAccessRouteWithAllowed,
  canManageAccounts,
  canManageProjects,
  canWriteUsers,
  isProjectScopedRole,
} from '@/lib/permissions';
import { useAuth } from '@/hooks/useAuth';

export function usePermissions() {
  const { account } = useAuth();
  const role = account?.role ?? '';
  const projectIds = account?.projectIds ?? [];
  const allowedRoutes = account?.allowedRoutes;

  return useMemo(
    () => ({
      role,
      projectIds,
      allowedRoutes,
      canAccess: (path: string) =>
        role ? canAccessRouteWithAllowed(role, path, allowedRoutes) : false,
      canWriteUsers: () => canWriteUsers(role),
      canManageAccounts: () => canManageAccounts(role),
      canManageProjects: () => canManageProjects(role),
      isProjectScoped: () => isProjectScopedRole(role),
    }),
    [role, projectIds, allowedRoutes],
  );
}

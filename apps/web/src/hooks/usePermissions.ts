'use client';

import { useMemo } from 'react';
import {
  canAccessRoute,
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

  return useMemo(
    () => ({
      role,
      projectIds,
      canAccess: (path: string) => (role ? canAccessRoute(role, path) : false),
      canWriteUsers: () => canWriteUsers(role),
      canManageAccounts: () => canManageAccounts(role),
      canManageProjects: () => canManageProjects(role),
      isProjectScoped: () => isProjectScopedRole(role),
    }),
    [role, projectIds],
  );
}

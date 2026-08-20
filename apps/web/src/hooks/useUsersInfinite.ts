'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { getUsers } from '@/lib/api';

export const USERS_INFINITE_PAGE_SIZE = 40;

export type UsersInfiniteParams = {
  search?: string;
  departmentId?: string;
  projectId?: string;
  contractorId?: string;
  enabled?: boolean;
  pageSize?: number;
};

export function usersInfiniteQueryKey(params: UsersInfiniteParams) {
  return [
    'users',
    'infinite',
    {
      search: params.search ?? '',
      departmentId: params.departmentId ?? '',
      projectId: params.projectId ?? '',
      contractorId: params.contractorId ?? '',
      pageSize: params.pageSize ?? USERS_INFINITE_PAGE_SIZE,
    },
  ] as const;
}

export function useUsersInfinite(params: UsersInfiniteParams = {}) {
  const pageSize = params.pageSize ?? USERS_INFINITE_PAGE_SIZE;
  const search = params.search?.trim() || undefined;
  const departmentId = params.departmentId || undefined;
  const projectId = params.projectId || undefined;
  const contractorId = params.contractorId || undefined;

  return useInfiniteQuery({
    queryKey: usersInfiniteQueryKey({ ...params, search, departmentId, projectId, contractorId, pageSize }),
    enabled: params.enabled !== false,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getUsers({
        page: pageParam,
        pageSize,
        search,
        departmentId,
        projectId,
        contractorId,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });
}

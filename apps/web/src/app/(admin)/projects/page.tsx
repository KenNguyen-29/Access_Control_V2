'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  BarChart3,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import { getProjects, ApiError, type Project } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

function usePagedRows<T>(rows: T[], page: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  return {
    pageRows: rows.slice(start, start + PAGE_SIZE),
    total,
    totalPages,
    currentPage,
  };
}

function contractorNames(project: Project): string {
  const names = project.contractors?.map((l) => l.contractor.name) ?? [];
  return names.length ? names.join(', ') : '—';
}

export default function ProjectsPage() {
  const { canManageProjects } = usePermissions();
  const [page, setPage] = useState(1);

  const projectsQuery = useQuery({
    queryKey: ['projects', 'ops'],
    queryFn: () => getProjects(),
  });

  const projects = projectsQuery.data ?? [];
  const { pageRows, total, totalPages, currentPage } = usePagedRows(projects, page);
  const canEdit = canManageProjects();

  return (
    <PageShell
      badge="Vận hành"
      title="Dự án"
      subtitle="Danh sách dự án công trường — xem nhân sự và báo cáo theo dự án."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void projectsQuery.refetch()}
          disabled={projectsQuery.isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', projectsQuery.isFetching && 'animate-spin')} />
          Làm mới
        </Button>
      }
    >
      <QueryBoundary
        isLoading={projectsQuery.isLoading}
        error={
          projectsQuery.error instanceof ApiError
            ? projectsQuery.error.message
            : projectsQuery.error
              ? 'Không tải được dự án'
              : null
        }
        onRetry={() => void projectsQuery.refetch()}
      >
        <DesignCard title="Danh sách dự án">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dự án nào trong phạm vi của bạn.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-label-caps text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="p-3 font-semibold">Tên</th>
                      <th className="p-3 font-semibold">Mã</th>
                      <th className="p-3 font-semibold">Công trường</th>
                      <th className="p-3 font-semibold">Nhà thầu</th>
                      <th className="p-3 font-semibold text-center">Số NV</th>
                      <th className="p-3 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p) => (
                      <tr key={p.id} className="border-b border-border/60 hover:bg-muted/30">
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{p.code}</td>
                        <td className="p-3 text-xs">{p.siteName || '—'}</td>
                        <td className="max-w-[200px] truncate p-3 text-xs" title={contractorNames(p)}>
                          {contractorNames(p)}
                        </td>
                        <td className="p-3 text-center font-mono text-xs">
                          {p._count?.users ?? 0}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Link
                              href={`/users?projectId=${p.id}`}
                              className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs hover:bg-muted"
                            >
                              <Users className="h-3.5 w-3.5" />
                              NV
                            </Link>
                            <Link
                              href={`/reports/contractors?projectId=${p.id}`}
                              className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs hover:bg-muted"
                            >
                              <BarChart3 className="h-3.5 w-3.5" />
                              BC
                            </Link>
                            {canEdit && (
                              <Link
                                href="/settings/contractors"
                                className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs hover:bg-muted"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Sửa
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {total > PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Trang {currentPage} / {totalPages} · {total} dự án
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DesignCard>
      </QueryBoundary>
    </PageShell>
  );
}

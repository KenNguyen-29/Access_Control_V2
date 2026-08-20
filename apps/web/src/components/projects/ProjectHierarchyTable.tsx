'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Users,
  BarChart3,
  Pencil,
  Trash2,
  ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TablePager } from '@/components/ui/table-pager';
import { QueryBoundary } from '@/components/ui/query-states';
import { ApiError, getUsers, type Project } from '@/lib/api';
import { cn } from '@/lib/utils';

const PERSONNEL_PAGE_SIZE = 10;

function ContractorPersonnel({
  projectId,
  contractorId,
}: {
  projectId: string;
  contractorId: string;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['users', 'project-tree', projectId, contractorId, page],
    queryFn: () =>
      getUsers({
        projectId,
        contractorId,
        page,
        pageSize: PERSONNEL_PAGE_SIZE,
      }),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, query.data?.totalPages ?? 1);

  return (
    <div className="border-t border-border/70 bg-muted/20 px-3 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Nhân sự thuộc nhà thầu
      </p>
      <QueryBoundary
        isLoading={query.isLoading}
        error={
          query.error instanceof ApiError
            ? query.error.message
            : query.error
              ? 'Không tải được nhân sự'
              : null
        }
        isEmpty={!query.isLoading && items.length === 0}
        onRetry={() => void query.refetch()}
        emptyTitle="Chưa có nhân sự"
        emptyDescription="Nhà thầu này chưa có nhân viên trên dự án."
      >
        <div className="overflow-x-auto rounded-sm border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="w-12 p-2 font-semibold">STT</th>
                <th className="p-2 font-semibold">Họ tên</th>
                <th className="p-2 font-semibold">Mã NV</th>
                <th className="p-2 font-semibold">CCCD</th>
                <th className="p-2 font-semibold">SĐT</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u, i) => (
                <tr key={u.id} className="border-t border-border/60">
                  <td className="p-2 font-mono text-xs text-muted-foreground">
                    {(page - 1) * PERSONNEL_PAGE_SIZE + i + 1}
                  </td>
                  <td className="p-2 font-medium">{u.fullName}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{u.employeeCode}</td>
                  <td className="p-2 font-mono text-xs">{u.citizenId || '—'}</td>
                  <td className="p-2 text-xs">{u.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePager
          className="mt-2 border-0 pt-2"
          currentPage={Math.min(page, totalPages)}
          totalPages={totalPages}
          total={total}
          unit="nhân viên"
          onPageChange={setPage}
        />
      </QueryBoundary>
    </div>
  );
}

export function ProjectHierarchyTable({
  projects,
  canEdit,
  onEditProject,
  onDeleteProject,
  onEditContractor,
  onDeleteContractor,
  onTransferContractor,
}: {
  projects: Project[];
  canEdit: boolean;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onEditContractor: (contractorId: string) => void;
  onDeleteContractor: (contractorId: string) => void;
  onTransferContractor: (contractorId: string, fromProjectId: string) => void;
}) {
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const [openContractors, setOpenContractors] = useState<Set<string>>(new Set());

  function toggleProject(id: string) {
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleContractor(key: string) {
    setOpenContractors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-label-caps text-xs uppercase tracking-wider text-muted-foreground">
            <th className="w-10 p-3 font-semibold" />
            <th className="p-3 font-semibold">Tên</th>
            <th className="p-3 font-semibold">Mã</th>
            <th className="p-3 font-semibold">Công trường</th>
            <th className="p-3 text-right font-semibold">Nhà thầu</th>
            <th className="p-3 text-right font-semibold">NV</th>
            <th className="p-3 text-right font-semibold">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const links = p.contractors ?? [];
            const projectOpen = openProjects.has(p.id);
            return (
              <ProjectRows
                key={p.id}
                project={p}
                links={links}
                projectOpen={projectOpen}
                openContractors={openContractors}
                canEdit={canEdit}
                onToggleProject={() => toggleProject(p.id)}
                onToggleContractor={toggleContractor}
                onEditProject={onEditProject}
                onDeleteProject={onDeleteProject}
                onEditContractor={onEditContractor}
                onDeleteContractor={onDeleteContractor}
                onTransferContractor={onTransferContractor}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRows({
  project,
  links,
  projectOpen,
  openContractors,
  canEdit,
  onToggleProject,
  onToggleContractor,
  onEditProject,
  onDeleteProject,
  onEditContractor,
  onDeleteContractor,
  onTransferContractor,
}: {
  project: Project;
  links: NonNullable<Project['contractors']>;
  projectOpen: boolean;
  openContractors: Set<string>;
  canEdit: boolean;
  onToggleProject: () => void;
  onToggleContractor: (key: string) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onEditContractor: (contractorId: string) => void;
  onDeleteContractor: (contractorId: string) => void;
  onTransferContractor: (contractorId: string, fromProjectId: string) => void;
}) {
  return (
    <>
      <tr className="border-t border-border hover:bg-muted/20">
        <td className="p-2">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm hover:bg-muted"
            onClick={onToggleProject}
            aria-label={projectOpen ? 'Thu gọn nhà thầu' : 'Xem nhà thầu'}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', projectOpen && 'rotate-90')} />
          </button>
        </td>
        <td className="p-3 font-semibold">{project.name}</td>
        <td className="p-3 font-mono text-xs text-muted-foreground">{project.code}</td>
        <td className="p-3 text-xs">{project.siteName || '—'}</td>
        <td className="p-3 text-right font-mono text-xs">{links.length}</td>
        <td className="p-3 text-right font-mono text-xs">{project._count?.users ?? 0}</td>
        <td className="p-3">
          <div className="flex justify-end gap-1">
            <Link
              href={`/users?projectId=${encodeURIComponent(project.id)}`}
              className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs hover:bg-muted"
            >
              <Users className="h-3.5 w-3.5" />
              NV
            </Link>
            <Link
              href={`/reports/contractors?projectId=${encodeURIComponent(project.id)}`}
              className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs hover:bg-muted"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              BC
            </Link>
            {canEdit && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditProject(project)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteProject(project)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>
      {projectOpen &&
        (links.length === 0 ? (
          <tr className="bg-muted/10">
            <td />
            <td colSpan={6} className="p-3 text-xs text-muted-foreground">
              Dự án chưa gắn nhà thầu.
            </td>
          </tr>
        ) : (
          links.map((link) => {
            const c = link.contractor;
            const key = `${project.id}:${link.contractorId}`;
            const contractorOpen = openContractors.has(key);
            return (
              <ContractorRows
                key={key}
                projectId={project.id}
                contractorId={link.contractorId}
                name={c.name}
                code={c.code}
                userCount={link.userCount ?? 0}
                open={contractorOpen}
                canEdit={canEdit}
                onToggle={() => onToggleContractor(key)}
                onEdit={() => onEditContractor(link.contractorId)}
                onDelete={() => onDeleteContractor(link.contractorId)}
                onTransfer={() => onTransferContractor(link.contractorId, project.id)}
              />
            );
          })
        ))}
    </>
  );
}

function ContractorRows({
  projectId,
  contractorId,
  name,
  code,
  userCount,
  open,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
  onTransfer,
}: {
  projectId: string;
  contractorId: string;
  name: string;
  code: string;
  userCount: number;
  open: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTransfer: () => void;
}) {
  return (
    <>
      <tr className="border-t border-border/50 bg-muted/15 hover:bg-muted/30">
        <td className="p-2 pl-6">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm hover:bg-muted"
            onClick={onToggle}
            aria-label={open ? 'Thu gọn nhân sự' : 'Xem nhân sự'}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
          </button>
        </td>
        <td className="p-3 pl-1">
          <span className="text-xs text-muted-foreground">Nhà thầu · </span>
          <span className="font-medium">{name}</span>
        </td>
        <td className="p-3 font-mono text-xs text-muted-foreground">{code}</td>
        <td className="p-3 text-xs text-muted-foreground">—</td>
        <td className="p-3 text-right text-xs text-muted-foreground">—</td>
        <td className="p-3 text-right font-mono text-xs">{userCount}</td>
        <td className="p-3">
          <div className="flex justify-end gap-1">
            <Link
              href={`/users?projectId=${encodeURIComponent(projectId)}&contractorId=${encodeURIComponent(contractorId)}`}
              className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs hover:bg-muted"
            >
              <Users className="h-3.5 w-3.5" />
              NV
            </Link>
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Chuyển sang dự án khác"
                  onClick={onTransfer}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/10">
          <td />
          <td colSpan={6} className="p-0">
            <ContractorPersonnel projectId={projectId} contractorId={contractorId} />
          </td>
        </tr>
      )}
    </>
  );
}

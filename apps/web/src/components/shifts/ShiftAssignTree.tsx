'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getProjects, getUsers, getUserIds, type Project, type User } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ShiftAssignTreeProps {
  selectedUserIds: Set<string>;
  onToggleUser: (id: string) => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
  enabled?: boolean;
}

type ExpandedKey = string;

export function ShiftAssignTree({
  selectedUserIds,
  onToggleUser,
  onToggleMany,
  enabled = true,
}: ShiftAssignTreeProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [expanded, setExpanded] = useState<Set<ExpandedKey>>(new Set());

  const projectsQuery = useQuery({
    queryKey: ['projects', 'shift-tree'],
    queryFn: () => getProjects(),
    enabled,
  });

  const projects = projectsQuery.data ?? [];

  const toggle = useCallback((key: ExpandedKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const matchesSearch = useCallback(
    (text: string) => {
      if (!debouncedSearch) return true;
      return text.toLowerCase().includes(debouncedSearch.toLowerCase());
    },
    [debouncedSearch],
  );

  useEffect(() => {
    if (debouncedSearch) {
      const allKeys = new Set<string>();
      for (const p of projects) {
        allKeys.add(`p-${p.id}`);
        for (const c of p.contractors ?? []) {
          allKeys.add(`c-${p.id}-${c.contractorId}`);
        }
      }
      setExpanded(allKeys);
    }
  }, [debouncedSearch, projects]);

  if (projectsQuery.isLoading) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Đang tải...</p>;
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm dự án, nhà thầu hoặc nhân viên..."
          className="input-design h-9 pl-10 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="max-h-[360px] overflow-y-auto rounded-sm border border-border">
        {projects.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Không có dự án</p>
        ) : (
          projects
            .filter((p) => {
              if (!debouncedSearch) return true;
              if (matchesSearch(p.name) || matchesSearch(p.code)) return true;
              return (p.contractors ?? []).some(
                (c) =>
                  matchesSearch(c.contractor.name) || matchesSearch(c.contractor.code),
              );
            })
            .map((p) => (
              <ProjectNode
                key={p.id}
                project={p}
                expanded={expanded.has(`p-${p.id}`)}
                onToggleExpand={() => toggle(`p-${p.id}`)}
                expandedContractors={expanded}
                onToggleContractor={(cId) => toggle(`c-${p.id}-${cId}`)}
                selectedUserIds={selectedUserIds}
                onToggleUser={onToggleUser}
                onToggleMany={onToggleMany}
                search={debouncedSearch}
              />
            ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Đã chọn <strong className="text-foreground">{selectedUserIds.size}</strong> nhân viên
      </p>
    </div>
  );
}

function ProjectNode({
  project,
  expanded,
  onToggleExpand,
  expandedContractors,
  onToggleContractor,
  selectedUserIds,
  onToggleUser,
  onToggleMany,
  search,
}: {
  project: Project;
  expanded: boolean;
  onToggleExpand: () => void;
  expandedContractors: Set<string>;
  onToggleContractor: (contractorId: string) => void;
  selectedUserIds: Set<string>;
  onToggleUser: (id: string) => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
  search: string;
}) {
  const projectUserIdsQuery = useQuery({
    queryKey: ['userIds', 'project', project.id],
    queryFn: () => getUserIds({ projectId: project.id }),
    enabled: expanded,
  });

  const projectUserIds = projectUserIdsQuery.data?.ids ?? [];
  const allSelected = projectUserIds.length > 0 && projectUserIds.every((id) => selectedUserIds.has(id));
  const someSelected = !allSelected && projectUserIds.some((id) => selectedUserIds.has(id));

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex cursor-pointer items-center gap-2 bg-muted/40 px-3 py-2 hover:bg-muted/60"
        onClick={onToggleExpand}
      >
        <ChevronRight
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
        />
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected; }}
          onChange={(e) => {
            e.stopPropagation();
            onToggleMany(projectUserIds, !allSelected);
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={projectUserIds.length === 0}
        />
        <span className="flex-1 text-sm font-semibold">{project.name}</span>
        <span className="text-xs text-muted-foreground">{project.code}</span>
      </div>

      {expanded && (
        <div className="pl-4">
          {(project.contractors ?? []).length === 0 ? (
            <ContractorUsersInline
              projectId={project.id}
              selectedUserIds={selectedUserIds}
              onToggleUser={onToggleUser}
              search={search}
            />
          ) : (
            (project.contractors ?? []).map((pc) => (
              <ContractorNode
                key={pc.contractorId}
                projectId={project.id}
                contractorId={pc.contractorId}
                contractorName={pc.contractor.name}
                contractorCode={pc.contractor.code}
                expanded={expandedContractors.has(`c-${project.id}-${pc.contractorId}`)}
                onToggleExpand={() => onToggleContractor(pc.contractorId)}
                selectedUserIds={selectedUserIds}
                onToggleUser={onToggleUser}
                onToggleMany={onToggleMany}
                search={search}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ContractorNode({
  projectId,
  contractorId,
  contractorName,
  contractorCode,
  expanded,
  onToggleExpand,
  selectedUserIds,
  onToggleUser,
  onToggleMany,
  search,
}: {
  projectId: string;
  contractorId: string;
  contractorName: string;
  contractorCode: string;
  expanded: boolean;
  onToggleExpand: () => void;
  selectedUserIds: Set<string>;
  onToggleUser: (id: string) => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
  search: string;
}) {
  const userIdsQuery = useQuery({
    queryKey: ['userIds', 'contractor-project', projectId, contractorId],
    queryFn: () => getUserIds({ projectId, contractorId }),
    enabled: expanded,
  });

  const ids = userIdsQuery.data?.ids ?? [];
  const allSelected = ids.length > 0 && ids.every((id) => selectedUserIds.has(id));
  const someSelected = !allSelected && ids.some((id) => selectedUserIds.has(id));

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/30"
        onClick={onToggleExpand}
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
        />
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected; }}
          onChange={(e) => {
            e.stopPropagation();
            onToggleMany(ids, !allSelected);
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={ids.length === 0}
        />
        <span className="flex-1 text-xs font-medium">{contractorName}</span>
        <span className="text-[10px] text-muted-foreground">{contractorCode}</span>
      </div>

      {expanded && (
        <UserList
          projectId={projectId}
          contractorId={contractorId}
          selectedUserIds={selectedUserIds}
          onToggleUser={onToggleUser}
          search={search}
        />
      )}
    </div>
  );
}

function ContractorUsersInline({
  projectId,
  selectedUserIds,
  onToggleUser,
  search,
}: {
  projectId: string;
  selectedUserIds: Set<string>;
  onToggleUser: (id: string) => void;
  search: string;
}) {
  return (
    <UserList
      projectId={projectId}
      selectedUserIds={selectedUserIds}
      onToggleUser={onToggleUser}
      search={search}
    />
  );
}

function UserList({
  projectId,
  contractorId,
  selectedUserIds,
  onToggleUser,
  search,
}: {
  projectId: string;
  contractorId?: string;
  selectedUserIds: Set<string>;
  onToggleUser: (id: string) => void;
  search: string;
}) {
  const usersQuery = useQuery({
    queryKey: ['users', 'tree', projectId, contractorId ?? ''],
    queryFn: () =>
      getUsers({
        projectId,
        contractorId,
        pageSize: 200,
      }),
  });

  const users = useMemo(() => {
    const items = usersQuery.data?.items ?? [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        (u.employeeCode || '').toLowerCase().includes(q),
    );
  }, [usersQuery.data?.items, search]);

  if (usersQuery.isLoading) {
    return <p className="px-6 py-2 text-[10px] text-muted-foreground">Đang tải...</p>;
  }

  if (users.length === 0) {
    return <p className="px-6 py-2 text-[10px] text-muted-foreground">Không có nhân viên</p>;
  }

  return (
    <div className="pl-6">
      {users.map((u) => (
        <label
          key={u.id}
          className="flex cursor-pointer items-center gap-2 py-1 text-xs hover:bg-muted/20"
        >
          <input
            type="checkbox"
            className="h-3 w-3 accent-primary"
            checked={selectedUserIds.has(u.id)}
            onChange={() => onToggleUser(u.id)}
          />
          <span className="flex-1 truncate">{u.fullName}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {u.employeeCode || '—'}
          </span>
        </label>
      ))}
    </div>
  );
}

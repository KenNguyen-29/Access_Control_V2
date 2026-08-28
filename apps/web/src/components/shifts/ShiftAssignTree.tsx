'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getProjects, getUsers, getUserIds, type Project } from '@/lib/api';
import { cn } from '@/lib/utils';

const USERS_PAGE_SIZE = 15;

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

async function fetchAllUserIds(params: {
  projectId: string;
  contractorId?: string;
}): Promise<string[]> {
  const out: string[] = [];
  let page = 1;
  const pageSize = 2000;
  while (true) {
    const result = await getUserIds({ ...params, page, pageSize });
    out.push(...result.ids);
    if (!result.hasMore) break;
    page += 1;
    if (page > 100) break;
  }
  return out;
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
  const [selectBusy, setSelectBusy] = useState(false);
  const [knownIds, setKnownIds] = useState<string[] | null>(null);

  const allSelected =
    knownIds != null && knownIds.length > 0 && knownIds.every((id) => selectedUserIds.has(id));
  const someSelected =
    knownIds != null && !allSelected && knownIds.some((id) => selectedUserIds.has(id));

  const handleSelectAll = async (e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectBusy(true);
    try {
      const ids = knownIds ?? (await fetchAllUserIds({ projectId: project.id }));
      setKnownIds(ids);
      const checked = !(ids.length > 0 && ids.every((id) => selectedUserIds.has(id)));
      onToggleMany(ids, checked);
    } finally {
      setSelectBusy(false);
    }
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex cursor-pointer items-center gap-2 bg-muted/40 px-3 py-2 hover:bg-muted/60"
        onClick={onToggleExpand}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={(e) => void handleSelectAll(e)}
          onClick={(e) => e.stopPropagation()}
          disabled={selectBusy}
          title="Chọn / bỏ chọn tất cả nhân viên dự án"
        />
        <span className="flex-1 text-sm font-semibold">{project.name}</span>
        <span className="text-xs text-muted-foreground">{project.code}</span>
      </div>

      {expanded && (
        <div className="pl-4">
          {(project.contractors ?? []).length === 0 ? (
            <UserList
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
  const [selectBusy, setSelectBusy] = useState(false);
  const [knownIds, setKnownIds] = useState<string[] | null>(null);

  const allSelected =
    knownIds != null && knownIds.length > 0 && knownIds.every((id) => selectedUserIds.has(id));
  const someSelected =
    knownIds != null && !allSelected && knownIds.some((id) => selectedUserIds.has(id));

  const handleSelectAll = async (e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectBusy(true);
    try {
      const ids =
        knownIds ?? (await fetchAllUserIds({ projectId, contractorId }));
      setKnownIds(ids);
      const checked = !(ids.length > 0 && ids.every((id) => selectedUserIds.has(id)));
      onToggleMany(ids, checked);
    } finally {
      setSelectBusy(false);
    }
  };

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/30"
        onClick={onToggleExpand}
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={(e) => void handleSelectAll(e)}
          onClick={(e) => e.stopPropagation()}
          disabled={selectBusy}
          title="Chọn / bỏ chọn tất cả nhân viên nhà thầu"
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
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<
    Array<{ id: string; fullName: string; employeeCode?: string | null }>
  >([]);

  const usersQuery = useQuery({
    queryKey: ['users', 'tree', projectId, contractorId ?? '', page, search, USERS_PAGE_SIZE],
    queryFn: () =>
      getUsers({
        projectId,
        contractorId,
        page,
        pageSize: USERS_PAGE_SIZE,
        search: search.trim() || undefined,
      }),
  });

  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [projectId, contractorId, search]);

  useEffect(() => {
    const items = usersQuery.data?.items;
    if (!items) return;
    setAccumulated((prev) => {
      if (page === 1) return items;
      const seen = new Set(prev.map((u) => u.id));
      const next = [...prev];
      for (const u of items) {
        if (!seen.has(u.id)) next.push(u);
      }
      return next;
    });
  }, [usersQuery.data?.items, page]);

  const totalPages = Math.max(1, usersQuery.data?.totalPages ?? 1);
  const hasMore = page < totalPages;

  if (usersQuery.isLoading && accumulated.length === 0) {
    return <p className="px-6 py-2 text-[10px] text-muted-foreground">Đang tải...</p>;
  }

  if (accumulated.length === 0) {
    return <p className="px-6 py-2 text-[10px] text-muted-foreground">Không có nhân viên</p>;
  }

  return (
    <div className="pl-6">
      {accumulated.map((u) => (
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
      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-7 w-full text-[10px]"
          disabled={usersQuery.isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          {usersQuery.isFetching ? 'Đang tải...' : `Tải thêm (${page}/${totalPages})`}
        </Button>
      )}
    </div>
  );
}

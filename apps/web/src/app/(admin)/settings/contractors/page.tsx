'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { RequiredMark } from '@/components/ui/field-error';
import { PageShell, DesignCard } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import {
  ApiError,
  createContractor,
  createProject,
  deleteContractor,
  deleteProject,
  getContractors,
  getProjects,
  updateContractor,
  updateProject,
  type Contractor,
  type Project,
} from '@/lib/api';
import { cn } from '@/lib/utils';

const EMPTY_C = { name: '', code: '', description: '' };
const EMPTY_P = {
  name: '',
  code: '',
  siteName: '',
  description: '',
  contractorIds: [] as string[],
};
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

function TablePager({
  currentPage,
  totalPages,
  total,
  unit,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  unit: string;
  onPageChange: (page: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Trang {currentPage} / {totalPages} · {total} {unit}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function ContractorsSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [cOpen, setCOpen] = useState(false);
  const [pOpen, setPOpen] = useState(false);
  const [editingC, setEditingC] = useState<Contractor | null>(null);
  const [editingP, setEditingP] = useState<Project | null>(null);
  const [cForm, setCForm] = useState(EMPTY_C);
  const [pForm, setPForm] = useState(EMPTY_P);
  const [deleteC, setDeleteC] = useState<Contractor | null>(null);
  const [deleteP, setDeleteP] = useState<Project | null>(null);
  const [filterContractor, setFilterContractor] = useState('');
  const [contractorPage, setContractorPage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);

  const contractorsQuery = useQuery({
    queryKey: ['contractors'],
    queryFn: () => getContractors(),
  });
  const projectsQuery = useQuery({
    queryKey: ['projects', filterContractor],
    queryFn: () => getProjects(filterContractor ? { contractorId: filterContractor } : undefined),
  });

  const contractors = contractorsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  useEffect(() => {
    setProjectPage(1);
  }, [filterContractor]);

  const contractorsPaged = usePagedRows(contractors, contractorPage);
  const projectsPaged = usePagedRows(projects, projectPage);

  const displayError =
    error ??
    (contractorsQuery.error instanceof ApiError
      ? contractorsQuery.error.message
      : contractorsQuery.error
        ? 'Không tải được nhà thầu'
        : null);

  const saveContractor = useMutation({
    mutationFn: () => {
      const payload = {
        name: cForm.name.trim(),
        code: cForm.code.trim(),
        description: cForm.description.trim() || undefined,
      };
      return editingC
        ? updateContractor(editingC.id, payload)
        : createContractor(payload);
    },
    onSuccess: () => {
      setCOpen(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['contractors'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu nhà thầu thất bại'),
  });

  const saveProject = useMutation({
    mutationFn: () => {
      const payload = {
        name: pForm.name.trim(),
        code: pForm.code.trim(),
        siteName: pForm.siteName.trim() || undefined,
        description: pForm.description.trim() || undefined,
        contractorIds: pForm.contractorIds,
      };
      return editingP ? updateProject(editingP.id, payload) : createProject(payload);
    },
    onSuccess: () => {
      setPOpen(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['contractors'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu dự án thất bại'),
  });

  const contractorOptions = useMemo(
    () => contractors.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` })),
    [contractors],
  );

  return (
    <PageShell
      badge="Cài đặt"
      title="Nhà thầu & Dự án"
      subtitle="Tổ chức nhân sự công trường theo nhà thầu và dự án."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            void queryClient.invalidateQueries({ queryKey: ['contractors'] });
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </Button>
      }
    >
      {displayError && (
        <p className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {displayError}
        </p>
      )}

      <DesignCard
        title={`Nhà thầu (${contractors.length})`}
        description="Đơn vị thầu phụ / nhà thầu trên công trường."
        actions={
          <Button
            variant="accent"
            size="sm"
            onClick={() => {
              setEditingC(null);
              setCForm(EMPTY_C);
              setCOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Thêm nhà thầu
          </Button>
        }
      >
        <QueryBoundary
          isLoading={contractorsQuery.isLoading}
          isEmpty={contractors.length === 0}
          emptyTitle="Chưa có nhà thầu"
          emptyDescription="Tạo nhà thầu đầu tiên để gắn nhân sự."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Tên</th>
                  <th className="p-2 font-semibold">Mã</th>
                  <th className="p-2 text-right font-semibold">Dự án</th>
                  <th className="p-2 text-right font-semibold">NV</th>
                  <th className="p-2 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {contractorsPaged.pageRows.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-2 font-semibold">{c.name}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{c.code}</td>
                    <td className="p-2 text-right">{c._count?.projects ?? 0}</td>
                    <td className="p-2 text-right">
                      <Link
                        href={`/users?contractorId=${encodeURIComponent(c.id)}`}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                        title={`Xem nhân viên của ${c.name}`}
                      >
                        {c._count?.users ?? 0}
                      </Link>
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/users?contractorId=${encodeURIComponent(c.id)}`}
                          className="inline-flex h-8 items-center gap-1 rounded-sm border border-tertiary/20 px-3 text-xs font-semibold hover:bg-tertiary/5"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Xem NV
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingC(c);
                            setCForm({
                              name: c.name,
                              code: c.code,
                              description: c.description ?? '',
                            });
                            setCOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteC(c)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager
            currentPage={contractorsPaged.currentPage}
            totalPages={contractorsPaged.totalPages}
            total={contractorsPaged.total}
            unit="nhà thầu"
            onPageChange={setContractorPage}
          />
        </QueryBoundary>
      </DesignCard>

      <DesignCard
        title={`Dự án (${projects.length})`}
        description="Dự án / công trình; mỗi dự án gồm một hoặc nhiều nhà thầu."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterContractor}
              onChange={(e) => {
                setFilterContractor(e.target.value);
                setProjectPage(1);
              }}
              className="h-9 w-48"
            >
              <option value="">Tất cả nhà thầu</option>
              {contractorOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                setEditingP(null);
                setPForm({
                  ...EMPTY_P,
                  contractorIds: filterContractor ? [filterContractor] : [],
                });
                setPOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Thêm dự án
            </Button>
          </div>
        }
      >
        <QueryBoundary
          isLoading={projectsQuery.isLoading}
          isEmpty={projects.length === 0}
          emptyTitle="Chưa có dự án"
          emptyDescription="Tạo dự án và gắn nhà thầu."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Tên</th>
                  <th className="p-2 font-semibold">Mã</th>
                  <th className="p-2 font-semibold">Công trường</th>
                  <th className="p-2 font-semibold">Nhà thầu</th>
                  <th className="p-2 text-right font-semibold">NV</th>
                  <th className="p-2 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {projectsPaged.pageRows.map((p) => {
                  const contractorNames =
                    p.contractors
                      ?.map((l) => l.contractor?.name)
                      .filter(Boolean)
                      .join(', ') || '—';
                  const usersHref = `/users?projectId=${encodeURIComponent(p.id)}`;
                  return (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-2 font-semibold">{p.name}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{p.code}</td>
                    <td className="p-2 text-muted-foreground">{p.siteName || '—'}</td>
                    <td className="max-w-[220px] truncate p-2 text-xs" title={contractorNames}>
                      {contractorNames}
                    </td>
                    <td className="p-2 text-right">
                      <Link
                        href={usersHref}
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                        title={`Xem nhân viên của dự án ${p.name}`}
                      >
                        {p._count?.users ?? 0}
                      </Link>
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={usersHref}
                          className="inline-flex h-8 items-center gap-1 rounded-sm border border-tertiary/20 px-3 text-xs font-semibold hover:bg-tertiary/5"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Xem NV
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingP(p);
                            setPForm({
                              name: p.name,
                              code: p.code,
                              siteName: p.siteName ?? '',
                              description: p.description ?? '',
                              contractorIds:
                                p.contractors?.map((l) => l.contractorId) ?? [],
                            });
                            setPOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteP(p)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePager
            currentPage={projectsPaged.currentPage}
            totalPages={projectsPaged.totalPages}
            total={projectsPaged.total}
            unit="dự án"
            onPageChange={setProjectPage}
          />
        </QueryBoundary>
      </DesignCard>

      <Dialog
        open={cOpen}
        onClose={() => setCOpen(false)}
        title={editingC ? 'Sửa nhà thầu' : 'Thêm nhà thầu'}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Tên
              <RequiredMark />
            </label>
            <Input
              className="input-design h-10"
              value={cForm.name}
              onChange={(e) => setCForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Mã
              <RequiredMark />
            </label>
            <Input
              className={cn('input-design h-10 font-mono')}
              value={cForm.code}
              onChange={(e) => setCForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Mô tả</label>
            <Input
              className="input-design h-10"
              value={cForm.description}
              onChange={(e) => setCForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={saveContractor.isPending || !cForm.name.trim() || !cForm.code.trim()}
              onClick={() => saveContractor.mutate()}
            >
              {saveContractor.isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={pOpen}
        onClose={() => setPOpen(false)}
        title={editingP ? 'Sửa dự án' : 'Thêm dự án'}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Tên
              <RequiredMark />
            </label>
            <Input
              className="input-design h-10"
              value={pForm.name}
              onChange={(e) => setPForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Mã
              <RequiredMark />
            </label>
            <Input
              className="input-design h-10 font-mono"
              value={pForm.code}
              onChange={(e) => setPForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Công trường</label>
            <Input
              className="input-design h-10"
              value={pForm.siteName}
              onChange={(e) => setPForm((f) => ({ ...f, siteName: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nhà thầu tham gia</label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
              {contractorOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có nhà thầu</p>
              ) : (
                contractorOptions.map((c) => {
                  const checked = pForm.contractorIds.includes(c.id);
                  return (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={checked}
                        onChange={() =>
                          setPForm((f) => ({
                            ...f,
                            contractorIds: checked
                              ? f.contractorIds.filter((id) => id !== c.id)
                              : [...f.contractorIds, c.id],
                          }))
                        }
                      />
                      <span>{c.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setPOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={saveProject.isPending || !pForm.name.trim() || !pForm.code.trim()}
              onClick={() => saveProject.mutate()}
            >
              {saveProject.isPending ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteC}
        onClose={() => setDeleteC(null)}
        onConfirm={() => {
          if (!deleteC) return;
          void deleteContractor(deleteC.id)
            .then(() => {
              setDeleteC(null);
              void queryClient.invalidateQueries({ queryKey: ['contractors'] });
            })
            .catch((e) => setError(e instanceof ApiError ? e.message : 'Xóa thất bại'));
        }}
        title="Xóa nhà thầu"
        message={`Xóa nhà thầu ${deleteC?.name ?? ''}?`}
        confirmLabel="Xóa"
      />
      <ConfirmDialog
        open={!!deleteP}
        onClose={() => setDeleteP(null)}
        onConfirm={() => {
          if (!deleteP) return;
          void deleteProject(deleteP.id)
            .then(() => {
              setDeleteP(null);
              void queryClient.invalidateQueries({ queryKey: ['projects'] });
            })
            .catch((e) => setError(e instanceof ApiError ? e.message : 'Xóa thất bại'));
        }}
        title="Xóa dự án"
        message={`Xóa dự án ${deleteP?.name ?? ''}?`}
        confirmLabel="Xóa"
      />
    </PageShell>
  );
}

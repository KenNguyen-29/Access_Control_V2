'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TablePager } from '@/components/ui/table-pager';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { RequiredMark } from '@/components/ui/field-error';
import { ContractorPickerTable } from '@/components/settings/ContractorPickerTable';
import { ProjectHierarchyTable } from '@/components/projects/ProjectHierarchyTable';
import { DesignCard, PageShell } from '@/components/design/PageShell';
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
  transferContractorProject,
  type Contractor,
  type Project,
} from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
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

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { canManageProjects } = usePermissions();
  const canEdit = canManageProjects();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cOpen, setCOpen] = useState(false);
  const [pOpen, setPOpen] = useState(false);
  const [editingC, setEditingC] = useState<Contractor | null>(null);
  const [editingP, setEditingP] = useState<Project | null>(null);
  const [cForm, setCForm] = useState(EMPTY_C);
  const [pForm, setPForm] = useState(EMPTY_P);
  const [deleteC, setDeleteC] = useState<Contractor | null>(null);
  const [deleteP, setDeleteP] = useState<Project | null>(null);
  const [transferC, setTransferC] = useState<Contractor | null>(null);
  const [transferForm, setTransferForm] = useState({ fromProjectId: '', toProjectId: '' });
  const [filterContractor, setFilterContractor] = useState('');
  const [projectPage, setProjectPage] = useState(1);
  const [projectSearch, setProjectSearch] = useState('');

  const contractorsQuery = useQuery({
    queryKey: ['contractors', 'all'],
    queryFn: () => getContractors(),
  });
  const projectsQuery = useQuery({
    queryKey: [
      'projects',
      'paged',
      projectPage,
      PAGE_SIZE,
      filterContractor || 'all',
      projectSearch.trim(),
    ],
    queryFn: () =>
      getProjects({
        page: projectPage,
        pageSize: PAGE_SIZE,
        contractorId: filterContractor || undefined,
        search: projectSearch.trim() || undefined,
      }),
  });
  const allProjectsQuery = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => getProjects(),
    enabled: !!transferC || pOpen,
  });

  const contractors = contractorsQuery.data ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const projectsTotal = projectsQuery.data?.total ?? 0;
  const projectsTotalPages = Math.max(1, projectsQuery.data?.totalPages ?? 1);
  const projectsCurrentPage = Math.min(projectPage, projectsTotalPages);
  const allProjects = allProjectsQuery.data ?? [];

  useEffect(() => {
    setProjectPage(1);
  }, [filterContractor, projectSearch]);

  const displayError =
    error ??
    (projectsQuery.error instanceof ApiError
      ? projectsQuery.error.message
      : projectsQuery.error
        ? 'Không tải được dự án'
        : contractorsQuery.error instanceof ApiError
          ? contractorsQuery.error.message
          : contractorsQuery.error
            ? 'Không tải được nhà thầu'
            : null);

  const saveContractor = useMutation({
    mutationFn: () => {
      const payload = {
        name: cForm.name.trim(),
        code: cForm.code.trim() || undefined,
        description: cForm.description.trim() || undefined,
      };
      return editingC ? updateContractor(editingC.id, payload) : createContractor(payload);
    },
    onSuccess: () => {
      setCOpen(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['contractors'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu nhà thầu thất bại'),
  });

  const saveProject = useMutation({
    mutationFn: () => {
      const payload = {
        name: pForm.name.trim(),
        code: pForm.code.trim() || undefined,
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

  const contractorPickerRows = useMemo(
    () => contractors.map((c) => ({ id: c.id, name: c.name, code: c.code })),
    [contractors],
  );

  const contractorById = useMemo(
    () => new Map(contractors.map((c) => [c.id, c])),
    [contractors],
  );

  const transferSourceProjects = useMemo(() => {
    if (!transferC) return [];
    return allProjects.filter((p) =>
      p.contractors?.some((l) => l.contractorId === transferC.id),
    );
  }, [allProjects, transferC]);

  const transferTargetProjects = useMemo(
    () => allProjects.filter((p) => p.id !== transferForm.fromProjectId),
    [allProjects, transferForm.fromProjectId],
  );

  const transferContractorMutation = useMutation({
    mutationFn: () => {
      if (!transferC) throw new ApiError('Chưa chọn nhà thầu', 400);
      if (!transferForm.fromProjectId || !transferForm.toProjectId) {
        throw new ApiError('Chọn dự án nguồn và dự án đích', 400);
      }
      return transferContractorProject(transferC.id, {
        fromProjectId: transferForm.fromProjectId,
        toProjectId: transferForm.toProjectId,
      });
    },
    onSuccess: (result) => {
      const name = transferC?.name ?? 'nhà thầu';
      setTransferC(null);
      setTransferForm({ fromProjectId: '', toProjectId: '' });
      setError(null);
      setNotice(`Đã chuyển ${name} sang dự án mới · ${result.usersMoved} nhân viên cập nhật dự án`);
      void queryClient.invalidateQueries({ queryKey: ['contractors'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Chuyển dự án thất bại'),
  });

  function openEditContractor(contractorId: string) {
    const c = contractorById.get(contractorId);
    if (!c) return;
    setEditingC(c);
    setCForm({
      name: c.name,
      code: c.code,
      description: c.description ?? '',
    });
    setCOpen(true);
  }

  function openTransfer(contractorId: string, fromProjectId: string) {
    const c = contractorById.get(contractorId);
    if (!c) return;
    setNotice(null);
    setError(null);
    setTransferC(c);
    setTransferForm({ fromProjectId, toProjectId: '' });
  }

  return (
    <PageShell
      badge="Vận hành"
      title="Dự án & Nhà thầu"
      subtitle="Mở dự án để xem toàn bộ nhà thầu; mở nhà thầu để xem nhân sự thuộc dự án đó."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            void queryClient.invalidateQueries({ queryKey: ['contractors'] });
            void queryClient.invalidateQueries({ queryKey: ['projects'] });
            void queryClient.invalidateQueries({ queryKey: ['users'] });
          }}
          disabled={projectsQuery.isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', projectsQuery.isFetching && 'animate-spin')} />
          Làm mới
        </Button>
      }
    >
      {displayError && (
        <p className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {displayError}
        </p>
      )}
      {notice && (
        <p className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <DesignCard
        title={`Dự án (${projectsTotal})`}
        description="Bấm mũi tên trên dòng dự án để liệt kê nhà thầu; bấm tiếp nhà thầu để xem nhân sự."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Tìm dự án..."
              className="input-design h-9 w-44"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
            />
            <Select
              value={filterContractor}
              onChange={(e) => setFilterContractor(e.target.value)}
              className="h-9 w-48"
            >
              <option value="">Tất cả nhà thầu</option>
              {contractorOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
            {canEdit && (
              <>
                <Button
                  variant="outline"
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
              </>
            )}
          </div>
        }
      >
        <QueryBoundary
          isLoading={projectsQuery.isLoading}
          isEmpty={projects.length === 0}
          emptyTitle="Chưa có dự án"
          emptyDescription={canEdit ? 'Tạo dự án và gắn nhà thầu.' : 'Chưa có dự án trong phạm vi của bạn.'}
        >
          <ProjectHierarchyTable
            projects={projects}
            canEdit={canEdit}
            onEditProject={(p) => {
              setEditingP(p);
              setPForm({
                name: p.name,
                code: p.code,
                siteName: p.siteName ?? '',
                description: p.description ?? '',
                contractorIds: p.contractors?.map((l) => l.contractorId) ?? [],
              });
              setPOpen(true);
            }}
            onDeleteProject={setDeleteP}
            onEditContractor={openEditContractor}
            onDeleteContractor={(id) => {
              const c = contractorById.get(id);
              if (c) setDeleteC(c);
            }}
            onTransferContractor={openTransfer}
          />
          <TablePager
            currentPage={projectsCurrentPage}
            totalPages={projectsTotalPages}
            total={projectsTotal}
            unit="dự án"
            onPageChange={setProjectPage}
          />
        </QueryBoundary>
      </DesignCard>

      {canEdit && (
        <Dialog open={cOpen} onClose={() => setCOpen(false)} title={editingC ? 'Sửa nhà thầu' : 'Thêm nhà thầu'}>
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
              <label className="mb-1 block text-xs text-muted-foreground">Mã</label>
              <Input
                className={cn('input-design h-10 font-mono')}
                placeholder="Tự sinh nếu để trống"
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
                disabled={saveContractor.isPending || !cForm.name.trim()}
                onClick={() => saveContractor.mutate()}
              >
                {saveContractor.isPending ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {canEdit && (
        <Dialog
          open={pOpen}
          onClose={() => setPOpen(false)}
          title={editingP ? 'Sửa dự án' : 'Thêm dự án'}
          className="w-[min(96vw,560px)] max-w-none"
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
              <label className="mb-1 block text-xs text-muted-foreground">Mã</label>
              <Input
                className="input-design h-10 font-mono"
                placeholder="Tự sinh nếu để trống"
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
              <ContractorPickerTable
                contractors={contractorPickerRows}
                selectedIds={pForm.contractorIds}
                onChange={(contractorIds) => setPForm((f) => ({ ...f, contractorIds }))}
                maxHeightClass="max-h-56"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPOpen(false)}>
                Hủy
              </Button>
              <Button
                variant="accent"
                size="sm"
                disabled={saveProject.isPending || !pForm.name.trim()}
                onClick={() => saveProject.mutate()}
              >
                {saveProject.isPending ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {canEdit && (
        <Dialog
          open={!!transferC}
          onClose={() => {
            setTransferC(null);
            setTransferForm({ fromProjectId: '', toProjectId: '' });
          }}
          title="Chuyển nhà thầu sang dự án khác"
          description={
            transferC
              ? `Thuyên chuyển ${transferC.name} (${transferC.code}) — nhân viên thuộc dự án nguồn sẽ được cập nhật dự án.`
              : undefined
          }
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Từ dự án</label>
              <Select
                className="h-10 w-full"
                value={transferForm.fromProjectId}
                onChange={(e) =>
                  setTransferForm({ fromProjectId: e.target.value, toProjectId: '' })
                }
              >
                <option value="">— Chọn dự án nguồn —</option>
                {transferSourceProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Sang dự án</label>
              <Select
                className="h-10 w-full"
                value={transferForm.toProjectId}
                disabled={!transferForm.fromProjectId}
                onChange={(e) =>
                  setTransferForm((f) => ({ ...f, toProjectId: e.target.value }))
                }
              >
                <option value="">— Chọn dự án đích —</option>
                {transferTargetProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Liên kết nhà thầu sẽ được gỡ khỏi dự án nguồn và gắn vào dự án đích. Nhân viên thuộc
              nhà thầu này ở dự án nguồn được cập nhật sang dự án đích.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTransferC(null);
                  setTransferForm({ fromProjectId: '', toProjectId: '' });
                }}
              >
                Hủy
              </Button>
              <Button
                variant="accent"
                size="sm"
                disabled={
                  transferContractorMutation.isPending ||
                  !transferForm.fromProjectId ||
                  !transferForm.toProjectId
                }
                onClick={() => transferContractorMutation.mutate()}
              >
                {transferContractorMutation.isPending ? 'Đang chuyển...' : 'Chuyển dự án'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      <ConfirmDialog
        open={!!deleteC}
        onClose={() => setDeleteC(null)}
        onConfirm={() => {
          if (!deleteC) return;
          void deleteContractor(deleteC.id)
            .then(() => {
              setDeleteC(null);
              void queryClient.invalidateQueries({ queryKey: ['contractors'] });
              void queryClient.invalidateQueries({ queryKey: ['projects'] });
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

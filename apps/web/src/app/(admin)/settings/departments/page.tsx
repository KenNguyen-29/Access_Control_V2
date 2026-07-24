'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { FieldError, RequiredMark } from '@/components/ui/field-error';
import { PageShell, DesignCard } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  createDepartment,
  deleteDepartment,
  getDepartments,
  updateDepartment,
  type Department,
} from '@/lib/api';
import {
  clearFieldError,
  hasFormErrors,
  validateDepartmentForm,
  type FieldErrors,
} from '@/lib/formValidation';
import { cn } from '@/lib/utils';

const EMPTY = { name: '', code: '', description: '' };
type DeptFieldErrors = FieldErrors<keyof typeof EMPTY>;

export default function DepartmentsSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<DeptFieldErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments(),
    queryFn: () => getDepartments(),
  });
  const items = departmentsQuery.data ?? [];
  const loading = departmentsQuery.isLoading;
  const displayError =
    error ??
    (departmentsQuery.error instanceof ApiError
      ? departmentsQuery.error.message
      : departmentsQuery.error
        ? 'Không tải được phòng ban'
        : null);

  function load() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.departments() });
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFieldErrors({});
    setOpen(true);
  }

  function openEdit(dept: Department) {
    setEditing(dept);
    setForm({ name: dept.name, code: dept.code, description: '' });
    setFieldErrors({});
    setOpen(true);
  }

  function patchForm(patch: Partial<typeof EMPTY>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setFieldErrors((prev) =>
      clearFieldError(prev, Object.keys(patch) as (keyof typeof EMPTY)[]),
    );
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || undefined,
      };
      return editing ? updateDepartment(editing.id, payload) : createDepartment(payload);
    },
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });
  const saving = saveMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: (target: Department) => deleteDepartment(target.id),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Xóa thất bại'),
  });
  const deleting = deleteMutation.isPending;

  function handleSave() {
    const errors = validateDepartmentForm(form);
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setError('Vui lòng kiểm tra lại thông tin đã nhập');
      return;
    }
    setError(null);
    saveMutation.mutate();
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  }

  return (
    <PageShell
      title="Phòng ban"
      subtitle="Quản lý phòng ban / bộ phận nhân sự"
      badge="Settings"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Thêm
          </Button>
        </div>
      }
    >
      <QueryBoundary
        isLoading={loading}
        error={displayError}
        onRetry={() => load()}
        isEmpty={!loading && items.length === 0}
        emptyTitle="Chưa có phòng ban"
        emptyDescription="Thêm phòng ban để gán cho nhân viên."
      >
        <DesignCard title="Danh sách phòng ban">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Mã</th>
                  <th className="px-3 py-2 font-semibold">Tên</th>
                  <th className="px-3 py-2 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="border-b border-border/60">
                    <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                    <td className="px-3 py-2 font-medium">{d.name}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)} title="Sửa">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(d)}
                        title="Xóa"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DesignCard>
      </QueryBoundary>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Sửa phòng ban' : 'Thêm phòng ban'}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Mã
              <RequiredMark />
            </label>
            <Input
              value={form.code}
              onChange={(e) => patchForm({ code: e.target.value })}
              placeholder="VD: HR"
              className={cn(fieldErrors.code && 'border-destructive')}
              aria-invalid={Boolean(fieldErrors.code)}
            />
            <FieldError message={fieldErrors.code} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Tên
              <RequiredMark />
            </label>
            <Input
              value={form.name}
              onChange={(e) => patchForm({ name: e.target.value })}
              placeholder="VD: Nhân sự"
              className={cn(fieldErrors.name && 'border-destructive')}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Mô tả</label>
            <Input
              value={form.description}
              onChange={(e) => patchForm({ description: e.target.value })}
              placeholder="Tùy chọn"
              className={cn(fieldErrors.description && 'border-destructive')}
              aria-invalid={Boolean(fieldErrors.description)}
            />
            <FieldError message={fieldErrors.description} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button disabled={saving} onClick={() => handleSave()}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete()}
        title="Xóa phòng ban"
        message={`Xóa phòng ban "${deleteTarget?.name}"?`}
        confirmLabel="Xóa"
        loading={deleting}
      />
    </PageShell>
  );
}

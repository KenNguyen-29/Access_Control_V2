'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { PageShell, DesignCard } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  createAccessZone,
  deleteAccessZone,
  getAccessZones,
  updateAccessZone,
  type AccessZone,
} from '@/lib/api';

const EMPTY = { name: '', parentZoneId: '', description: '' };

export default function ZonesSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccessZone | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<AccessZone | null>(null);

  const zonesQuery = useQuery({
    queryKey: queryKeys.accessZones(),
    queryFn: () => getAccessZones(),
  });
  const items = zonesQuery.data ?? [];
  const loading = zonesQuery.isLoading;
  const displayError =
    error ??
    (zonesQuery.error instanceof ApiError
      ? zonesQuery.error.message
      : zonesQuery.error
        ? 'Không tải được khu vực'
        : null);

  function load() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.accessZones() });
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(zone: AccessZone) {
    setEditing(zone);
    setForm({
      name: zone.name,
      parentZoneId: zone.parentZoneId || '',
      description: zone.description || '',
    });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        parentZoneId: form.parentZoneId || undefined,
        description: form.description.trim() || undefined,
      };
      return editing ? updateAccessZone(editing.id, payload) : createAccessZone(payload);
    },
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.accessZones() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });
  const saving = saveMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: (target: AccessZone) => deleteAccessZone(target.id),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.accessZones() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Xóa thất bại'),
  });
  const deleting = deleteMutation.isPending;

  function handleSave() {
    if (!form.name.trim()) return;
    saveMutation.mutate();
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  }

  const parentOptions = items.filter((z) => z.id !== editing?.id);

  return (
    <PageShell
      title="Khu vực"
      subtitle="Quản lý khu vực truy cập (access zones)"
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
        emptyTitle="Chưa có khu vực"
        emptyDescription="Thêm khu vực để phân quyền ra vào."
      >
        <DesignCard title="Danh sách khu vực">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Tên</th>
                  <th className="px-3 py-2 font-semibold">Khu vực cha</th>
                  <th className="px-3 py-2 font-semibold">Mô tả</th>
                  <th className="px-3 py-2 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((z) => (
                  <tr key={z.id} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium">{z.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {z.parentZone?.name || items.find((p) => p.id === z.parentZoneId)?.name || '—'}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">
                      {z.description || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(z)} title="Sửa">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(z)}
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
        title={editing ? 'Sửa khu vực' : 'Thêm khu vực'}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Tên</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VD: Nhà máy A"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Khu vực cha</label>
            <Select
              value={form.parentZoneId}
              onChange={(e) => setForm((f) => ({ ...f, parentZoneId: e.target.value }))}
            >
              <option value="">Không có</option>
              {parentOptions.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Mô tả</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Tùy chọn"
            />
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
        title="Xóa khu vực"
        message={`Xóa khu vực "${deleteTarget?.name}"?`}
        confirmLabel="Xóa"
        loading={deleting}
      />
    </PageShell>
  );
}

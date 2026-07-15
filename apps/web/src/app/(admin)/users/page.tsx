'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, X, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { QueryBoundary } from '@/components/ui/query-states';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { queryKeys } from '@/lib/queryKeys';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  createUser,
  deleteUser,
  enrollFace,
  getDepartments,
  getUsers,
  updateUser,
  type Department,
  type User,
  ApiError,
} from '@/lib/api';

const EMPTY_FORM = {
  employeeCode: '',
  fullName: '',
  email: '',
  phone: '',
  departmentId: '',
  faceImageFile: null as File | null,
  facePreviewUrl: '',
};

/** Resize + compress an image file to JPEG (max edge 1024px). */
async function compressImageFile(file: File, maxEdge = 1024, quality = 0.85): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new File([file], 'face.jpg', { type: 'image/jpeg' });
    }
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh'))),
        'image/jpeg',
        quality,
      );
    });
    return new File([blob], 'face.jpg', { type: 'image/jpeg' });
  } catch {
    return new File([file], 'face.jpg', { type: 'image/jpeg' });
  }
}

function revokePreviewUrl(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

const PAGE_SIZE = 10;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [deptFilter, setDeptFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const departmentId = deptFilter === 'all' ? undefined : deptFilter;

  const usersQuery = useQuery({
    queryKey: queryKeys.users({ page, search: debouncedSearch, departmentId }),
    queryFn: () =>
      getUsers({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        departmentId,
      }),
  });
  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments(),
    queryFn: () => getDepartments(),
  });

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = usersQuery.data?.totalPages ?? 1;
  const currentPage = Math.min(page, totalPages);
  const departments: Department[] = departmentsQuery.data ?? [];
  const loading = usersQuery.isLoading || departmentsQuery.isLoading;
  const queryError = usersQuery.error ?? departmentsQuery.error;
  const displayError =
    error ??
    (queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Không tải được dữ liệu'
        : null);

  function load() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.departments() });
  }

  const hasActiveFilters = search.trim() !== '' || deptFilter !== 'all';

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, deptFilter]);

  function clearFilters() {
    setSearch('');
    setDeptFilter('all');
    setPage(1);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      email: user.email || '',
      phone: user.phone || '',
      departmentId: user.departmentId || '',
      faceImageFile: null,
      facePreviewUrl: user.faceImageUrl || '',
    });
    setOpen(true);
  }

  async function onPickFace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const jpegFile = await compressImageFile(file);
      setForm((prev) => {
        revokePreviewUrl(prev.facePreviewUrl);
        return {
          ...prev,
          faceImageFile: jpegFile,
          facePreviewUrl: URL.createObjectURL(jpegFile),
        };
      });
    } catch {
      setError('Không đọc được ảnh đã chọn');
    }
    e.target.value = '';
  }

  function clearFaceImage() {
    setForm((prev) => {
      revokePreviewUrl(prev.facePreviewUrl);
      return { ...prev, faceImageFile: null, facePreviewUrl: '' };
    });
  }

  useEffect(() => {
    return () => revokePreviewUrl(form.facePreviewUrl);
  }, [form.facePreviewUrl]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        employeeCode: form.employeeCode.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        departmentId: form.departmentId || undefined,
      };
      const saved = editing
        ? await updateUser(editing.id, payload)
        : await createUser(payload);

      // Upload face as JPG file to MinIO after the user exists
      if (form.faceImageFile) {
        await enrollFace(saved.id, form.faceImageFile);
      }
      return saved;
    },
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });
  const saving = saveMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: (target: User) => deleteUser(target.id),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Xóa thất bại'),
  });
  const deleting = deleteMutation.isPending;

  function onSave() {
    saveMutation.mutate();
  }

  function onConfirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  }

  return (
    <PageShell
      badge="Quản trị"
      title="Quản lý Nhân sự"
      subtitle="Danh sách nhân viên, phòng ban và thông tin liên hệ."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Làm mới
          </Button>
          <Button variant="accent" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Thêm nhân viên
          </Button>
        </>
      }
    >
      <DesignCard title="Tìm kiếm & bộ lọc">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_200px_auto]">
          <div>
            <label htmlFor="user-search" className="mb-1 block text-xs text-muted-foreground">
              Tìm kiếm
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="user-search"
                placeholder="Tên hoặc mã nhân viên..."
                className="input-design h-10 pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="user-dept" className="mb-1 block text-xs text-muted-foreground">
              Phòng ban
            </label>
            <Select
              id="user-dept"
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Tất cả phòng ban</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-10 gap-1.5" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </DesignCard>

      <DesignCard
        title={`Danh sách nhân viên (${total})`}
        description={
          hasActiveFilters
            ? `Tìm thấy ${total} kết quả phù hợp`
            : `Tổng cộng ${total} nhân viên`
        }
      >
        <QueryBoundary
          isLoading={loading}
          error={displayError}
          isEmpty={total === 0}
          onRetry={() => load()}
          emptyTitle={hasActiveFilters ? 'Không tìm thấy nhân viên' : 'Chưa có nhân viên'}
          emptyDescription={
            hasActiveFilters
              ? 'Thử thay đổi từ khóa hoặc bộ lọc phòng ban.'
              : 'Thêm nhân viên mới để bắt đầu.'
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-12" />
                <col className="w-[26%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-center font-semibold text-muted-foreground">#</th>
                  <th className="p-3 text-left font-semibold">Họ tên</th>
                  <th className="p-3 text-left font-semibold">Mã NV</th>
                  <th className="p-3 text-left font-semibold">Phòng ban</th>
                  <th className="p-3 text-left font-semibold">Email</th>
                  <th className="p-3 text-left font-semibold">SĐT</th>
                  <th className="p-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u, i) => (
                  <tr key={u.id} className="border-t border-border transition-colors hover:bg-muted/20">
                    <td className="p-3 text-center font-mono text-xs text-muted-foreground">
                      {(currentPage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.fullName} src={u.faceImageUrl} />
                        <span className="truncate font-semibold">{u.fullName}</span>
                      </div>
                    </td>
                    <td className="truncate p-3 font-mono text-xs text-muted-foreground">
                      {u.employeeCode}
                    </td>
                    <td className="p-3">
                      {u.department?.name ? (
                        <Badge variant="secondary" className="bg-blue-100 text-xs font-medium text-blue-700">
                          {u.department.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="truncate p-3">{u.email || '—'}</td>
                    <td className="truncate p-3">{u.phone || '—'}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(u)}
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

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Trang {currentPage} / {totalPages} · {total} nhân viên
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </QueryBoundary>
      </DesignCard>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Sửa nhân viên' : 'Thêm nhân viên'}
        description="Nhập thông tin nhân viên và lưu lại."
      >
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="relative flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 border-dashed border-border bg-muted/30">
              {form.facePreviewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.facePreviewUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white"
                    onClick={clearFaceImage}
                    title="Xóa ảnh"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <span className="text-3xl font-semibold text-muted-foreground/40">
                  {(form.fullName.trim()[0] || '?').toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Ảnh khuôn mặt (FaceID)</label>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="w-full text-xs"
                onChange={(e) => void onPickFace(e)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Mã nhân viên</label>
            <Input
              placeholder="VD: NV001"
              className="input-design h-10"
              value={form.employeeCode}
              onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Họ tên</label>
            <Input
              placeholder="Nguyễn Văn A"
              className="input-design h-10"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Email</label>
              <Input
                placeholder="email@example.com"
                className="input-design h-10"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Số điện thoại</label>
              <Input
                placeholder="09xxxxxxxx"
                className="input-design h-10"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Phòng ban</label>
            <Select
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              <option value="">— Chọn phòng ban —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={saving || !form.employeeCode || !form.fullName}
              onClick={() => onSave()}
            >
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => onConfirmDelete()}
        title="Xóa nhân viên"
        message={`Bạn có chắc muốn xóa nhân viên ${deleteTarget?.fullName ?? ''}? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        loading={deleting}
      />
    </PageShell>
  );
}

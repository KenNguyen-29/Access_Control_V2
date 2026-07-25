'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
} from 'lucide-react';
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
  downloadUsersImportTemplate,
  enrollFace,
  getAccessZones,
  getDepartments,
  getUsers,
  importUsers,
  provisionUser,
  updateUser,
  type Department,
  type User,
  ApiError,
} from '@/lib/api';
import {
  hasFormErrors,
  validateUserForm,
  type UserFormFieldErrors,
} from '@/lib/formValidation';
import { FieldError, RequiredMark } from '@/components/ui/field-error';
import { cn } from '@/lib/utils';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_FORM = {
  employeeCode: '',
  fullName: '',
  email: '',
  phone: '',
  departmentId: '',
  zoneIds: [] as string[],
  autoSyncFace: true,
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

function summarizeProvisionResult(
  provision: NonNullable<Awaited<ReturnType<typeof provisionUser>>>,
  fallbackCode: string,
) {
  const mocked = provision.syncByZone.filter((zone) => zone.mock);
  const successfulZones = provision.syncByZone.filter(
    (zone) => !zone.mock && zone.results.some((result) => result.ok),
  );
  const failures = provision.syncByZone.flatMap((zone) =>
    zone.results
      .filter((result) => !result.ok)
      .map((result) => `${zone.zoneName}: ${result.error || result.deviceName}`),
  );

  if (mocked.length > 0) {
    return {
      notice: `Đã lưu nhân viên ${fallbackCode} · Hệ thống đang ở mock mode nên chưa gửi thật lên thiết bị`,
      error: failures.length > 0 ? failures.join(' | ') : null,
    };
  }
  if (provision.autoSync && successfulZones.length > 0) {
    return {
      notice: `Đã lưu nhân viên ${fallbackCode} · Đã đẩy FaceID lên ${successfulZones.map((zone) => zone.zoneName).join(', ')}`,
      error: failures.length > 0 ? failures.join(' | ') : null,
    };
  }
  if (provision.autoSync) {
    return {
      notice: `Đã lưu nhân viên ${fallbackCode}`,
      error: failures.join(' | ') || 'Chưa đồng bộ được thiết bị, kiểm tra HTTP API và FaceURL',
    };
  }
  return {
    notice: `Đã lưu nhân viên ${fallbackCode} và gán khu vực`,
    error: failures.length > 0 ? failures.join(' | ') : null,
  };
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [deptFilter, setDeptFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<UserFormFieldErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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
  const zonesQuery = useQuery({
    queryKey: ['accessZones'],
    queryFn: () => getAccessZones(),
  });

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = usersQuery.data?.totalPages ?? 1;
  const currentPage = Math.min(page, totalPages);
  const departments: Department[] = departmentsQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const loading = usersQuery.isLoading || departmentsQuery.isLoading || zonesQuery.isLoading;
  const queryError = usersQuery.error ?? departmentsQuery.error ?? zonesQuery.error;
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
    setForm({ ...EMPTY_FORM, autoSyncFace: true });
    setFieldErrors({});
    setNotice(null);
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
      zoneIds: [],
      autoSyncFace: false,
      faceImageFile: null,
      facePreviewUrl: user.faceImageUrl || '',
    });
    setFieldErrors({});
    setOpen(true);
  }

  function patchForm(patch: Partial<typeof EMPTY_FORM>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof UserFormFieldErrors)[]) {
        if (key in next) delete next[key];
      }
      return next;
    });
  }

  async function onPickFace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const jpegFile = await compressImageFile(file);
      setForm((prev) => {
        revokePreviewUrl(prev.facePreviewUrl);
        const next = {
          ...prev,
          faceImageFile: jpegFile,
          facePreviewUrl: URL.createObjectURL(jpegFile),
        };
        return {
          ...next,
          autoSyncFace:
            next.zoneIds.length > 0 ? true : prev.autoSyncFace,
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
      return { ...prev, faceImageFile: null, facePreviewUrl: '', autoSyncFace: false };
    });
  }

  useEffect(() => {
    return () => revokePreviewUrl(form.facePreviewUrl);
  }, [form.facePreviewUrl]);

  function toggleZone(zoneId: string) {
    setForm((prev) => {
      const zoneIds = prev.zoneIds.includes(zoneId)
        ? prev.zoneIds.filter((id) => id !== zoneId)
        : [...prev.zoneIds, zoneId];
      const hasFace = Boolean(prev.faceImageFile || prev.facePreviewUrl);
      return {
        ...prev,
        zoneIds,
        autoSyncFace: hasFace && zoneIds.length > 0 ? prev.autoSyncFace : false,
      };
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const hasNewFace = Boolean(form.faceImageFile);
      const isCreate = !editing;
      if (isCreate && hasNewFace && form.autoSyncFace && form.zoneIds.length === 0) {
        throw new ApiError('Chọn ít nhất một khu vực để đồng bộ FaceID', 400);
      }
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        departmentId: form.departmentId || undefined,
      };
      const errors = validateUserForm(form);
      if (hasFormErrors(errors)) {
        throw new ApiError('Vui lòng kiểm tra lại thông tin đã nhập', 400);
      }
      const saved = editing
        ? await updateUser(editing.id, { ...payload, employeeCode: form.employeeCode.trim() })
        : await createUser(payload);

      if (form.faceImageFile) {
        await enrollFace(saved.id, form.faceImageFile);
      }

      if (isCreate && form.zoneIds.length > 0) {
        const provision = await provisionUser(saved.id, {
          zoneIds: form.zoneIds,
          autoSync: form.autoSyncFace && (hasNewFace || Boolean(form.facePreviewUrl)),
        });
        return { saved, provision, isCreate };
      }
      return { saved, provision: null, isCreate };
    },
    onSuccess: ({ saved, provision, isCreate }) => {
      setError(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['permissions'] });
      if (isCreate && provision) {
        const summary = summarizeProvisionResult(provision, saved.employeeCode);
        setNotice(summary.notice);
        setError(summary.error);
      } else {
        setNotice(`Đã lưu nhân viên ${saved.employeeCode}`);
      }
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
    const errors = validateUserForm(form);
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setError('Vui lòng kiểm tra lại thông tin đã nhập');
      return;
    }
    setError(null);
    saveMutation.mutate();
  }

  function onConfirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  }

  async function onDownloadTemplate() {
    setError(null);
    try {
      const blob = await downloadUsersImportTemplate();
      downloadBlob(blob, 'mau-nhan-su.xlsx');
      setNotice('Đã tải mẫu Excel nhân sự');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Tải mẫu thất bại');
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setError(null);
    setImportErrors(null);
    setNotice(null);
    try {
      const result = await importUsers(file);
      const facePart =
        result.facesEnrolled != null ? `, FaceID ${result.facesEnrolled}` : '';
      const zonePart =
        result.zonesAssigned != null ? `, khu vực ${result.zonesAssigned}` : '';
      const errPart = result.errors.length > 0 ? `, ${result.errors.length} lỗi` : '';
      setNotice(
        `Import xong: tạo ${result.created}, cập nhật ${result.updated}, bỏ qua ${result.skipped}${facePart}${zonePart}${errPart}.`,
      );
      if (result.errors.length > 0) {
        setImportErrors(
          result.errors
            .slice(0, 20)
            .map((e) => `Dòng ${e.row}: ${e.message}`)
            .join('\n') + (result.errors.length > 20 ? '\n…' : ''),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setPage(1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nhập Excel thất bại');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  return (
    <PageShell
      badge="Quản trị"
      title="Quản lý Nhân sự"
      subtitle="Danh sách nhân viên, phòng ban và thông tin liên hệ."
      actions={
        <>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.zip"
            className="hidden"
            onChange={(e) => void onImportFile(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onDownloadTemplate()}
            disabled={loading || importing}
            title="Mẫu: dán ảnh vào cột Ảnh; khu vực nhiều tên cách nhau bởi ;. ZIP = Excel + ảnh."
          >
            <Download className="h-4 w-4" />
            Tải mẫu Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => importInputRef.current?.click()}
            disabled={loading || importing}
            title="Nhận .xlsx (ảnh dán trong file) hoặc .zip (Excel + ảnh)"
          >
            <Upload className="h-4 w-4" />
            {importing ? 'Đang import...' : 'Import Excel'}
          </Button>
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
      {notice && (
        <p className="mb-4 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {importErrors && (
        <pre className="mb-4 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {importErrors}
        </pre>
      )}
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
          {editing ? (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Mã nhân viên</label>
              <Input
                className="input-design h-10"
                value={form.employeeCode}
                readOnly
                disabled
              />
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              Mã nhân viên sẽ được tự sinh sau khi lưu theo dạng <span className="font-mono">NV-0001</span>.
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Họ tên
              <RequiredMark />
            </label>
            <Input
              placeholder="Nguyễn Văn A"
              className={cn('input-design h-10', fieldErrors.fullName && 'border-destructive')}
              value={form.fullName}
              onChange={(e) => patchForm({ fullName: e.target.value })}
              aria-invalid={Boolean(fieldErrors.fullName)}
            />
            <FieldError message={fieldErrors.fullName} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Email
                <RequiredMark />
              </label>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="email@example.com"
                className={cn('input-design h-10', fieldErrors.email && 'border-destructive')}
                value={form.email}
                onChange={(e) => patchForm({ email: e.target.value })}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              <FieldError message={fieldErrors.email} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Số điện thoại
                <RequiredMark />
              </label>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0912345678"
                className={cn('input-design h-10', fieldErrors.phone && 'border-destructive')}
                value={form.phone}
                onChange={(e) => patchForm({ phone: e.target.value })}
                aria-invalid={Boolean(fieldErrors.phone)}
              />
              <FieldError message={fieldErrors.phone} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Phòng ban</label>
            <Select
              value={form.departmentId}
              onChange={(e) => patchForm({ departmentId: e.target.value })}
            >
              <option value="">— Chọn phòng ban —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          {!editing && (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Khu vực ra vào
                  {(form.faceImageFile || form.facePreviewUrl) && (
                    <span className="text-destructive"> *</span>
                  )}
                </label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
                  {zones.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có khu vực — tạo trong Kiểm soát truy cập</p>
                  ) : (
                    zones.map((z) => (
                      <label key={z.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-primary"
                          checked={form.zoneIds.includes(z.id)}
                          onChange={() => toggleZone(z.id)}
                        />
                        <span>{z.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={form.autoSyncFace}
                  disabled={
                    form.zoneIds.length === 0 || !(form.faceImageFile || form.facePreviewUrl)
                  }
                  onChange={(e) => setForm({ ...form, autoSyncFace: e.target.checked })}
                />
                <span>Đồng bộ FaceID lên thiết bị ngay</span>
              </label>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={saving}
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

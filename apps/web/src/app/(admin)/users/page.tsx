'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  RefreshCw,
  Download,
  Upload,
  ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TablePager } from '@/components/ui/table-pager';
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
  getContractors,
  getDepartments,
  getProjects,
  getUsers,
  getWorkShifts,
  importUsers,
  provisionUser,
  transferUserProject,
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
import { usePermissions } from '@/hooks/usePermissions';
import { MovedSettingsLinks } from '@/components/settings/MovedSettingsLinks';

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
  citizenId: '',
  userType: 'EMPLOYEE',
  departmentId: '',
  contractorId: '',
  projectId: '',
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
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('File không phải ảnh hợp lệ'));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Trình duyệt không hỗ trợ nén ảnh');
  }
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh'))),
      'image/jpeg',
      quality,
    );
  });
  if (blob.size < 100) {
    throw new Error('Ảnh quá nhỏ hoặc không hợp lệ');
  }
  return new File([blob], 'face.jpg', { type: 'image/jpeg' });
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
  const router = useRouter();
  const pathname = usePathname();
  const { canWriteUsers } = usePermissions();
  const writeEnabled = canWriteUsers();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [deptFilter, setDeptFilter] = useState('all');
  const [contractorFilter, setContractorFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<UserFormFieldErrors>({});
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [transferTarget, setTransferTarget] = useState<User | null>(null);
  const [transferForm, setTransferForm] = useState({
    toProjectId: '',
    zoneId: '',
    workShiftId: '',
    note: '',
  });
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importExcel, setImportExcel] = useState<File | null>(null);
  const [importZip, setImportZip] = useState<File | null>(null);

  const departmentId = deptFilter === 'all' ? undefined : deptFilter;
  const contractorId = contractorFilter === 'all' ? undefined : contractorFilter;
  const projectId = projectFilter === 'all' ? undefined : projectFilter;

  function syncFilterUrl(nextContractor: string, nextProject: string) {
    const q = new URLSearchParams();
    if (nextContractor !== 'all') q.set('contractorId', nextContractor);
    if (nextProject !== 'all') q.set('projectId', nextProject);
    const qs = q.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    const current = `${pathname}${window.location.search}`;
    if (next !== current) {
      router.replace(next, { scroll: false });
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('contractorId');
    const p = params.get('projectId');
    if (c) setContractorFilter(c);
    if (p) setProjectFilter(p);
  }, []);

  const usersQuery = useQuery({
    queryKey: queryKeys.users({
      page,
      search: debouncedSearch,
      departmentId,
      contractorId,
      projectId,
    }),
    queryFn: () =>
      getUsers({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        departmentId,
        contractorId,
        projectId,
      }),
  });
  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments(),
    queryFn: () => getDepartments(),
  });
  const contractorsQuery = useQuery({
    queryKey: ['contractors'],
    queryFn: () => getContractors(),
  });
  const listProjectsQuery = useQuery({
    queryKey: ['projects', 'list-filter', contractorFilter],
    queryFn: () =>
      getProjects(
        contractorFilter !== 'all' ? { contractorId: contractorFilter } : undefined,
      ),
  });
  const projectsQuery = useQuery({
    queryKey: ['projects', form.contractorId || 'all'],
    queryFn: () =>
      getProjects(form.contractorId ? { contractorId: form.contractorId } : undefined),
    enabled: open,
  });
  const zonesQuery = useQuery({
    queryKey: ['accessZones'],
    queryFn: () => getAccessZones(),
  });
  const transferProjectsQuery = useQuery({
    queryKey: ['projects', 'transfer', transferTarget?.contractorId ?? 'all'],
    queryFn: () =>
      getProjects(
        transferTarget?.contractorId
          ? { contractorId: transferTarget.contractorId }
          : undefined,
      ),
    enabled: !!transferTarget,
  });
  const workShiftsQuery = useQuery({
    queryKey: ['workShifts'],
    queryFn: () => getWorkShifts(),
    enabled: !!transferTarget,
  });

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = usersQuery.data?.totalPages ?? 1;
  const currentPage = Math.min(page, totalPages);
  const departments: Department[] = departmentsQuery.data ?? [];
  const contractors = contractorsQuery.data ?? [];
  const listProjects = listProjectsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const transferProjects = transferProjectsQuery.data ?? [];
  const workShifts = workShiftsQuery.data ?? [];

  const selectedFormProject = useMemo(
    () => projects.find((p) => p.id === form.projectId) ?? null,
    [projects, form.projectId],
  );
  const projectContractorIds = useMemo(
    () => selectedFormProject?.contractors?.map((l) => l.contractorId) ?? [],
    [selectedFormProject],
  );
  const formContractorOptions = useMemo(() => {
    if (!form.projectId || projectContractorIds.length === 0) return contractors;
    return contractors.filter((c) => projectContractorIds.includes(c.id));
  }, [contractors, form.projectId, projectContractorIds]);

  const loading =
    usersQuery.isLoading ||
    departmentsQuery.isLoading ||
    zonesQuery.isLoading ||
    contractorsQuery.isLoading;

  const filteredContractorName = useMemo(
    () =>
      contractorFilter === 'all'
        ? null
        : contractors.find((c) => c.id === contractorFilter)?.name ?? null,
    [contractorFilter, contractors],
  );
  const filteredProjectName = useMemo(
    () =>
      projectFilter === 'all'
        ? null
        : listProjects.find((p) => p.id === projectFilter)?.name ?? null,
    [projectFilter, listProjects],
  );
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

  const hasActiveFilters =
    search.trim() !== '' ||
    deptFilter !== 'all' ||
    contractorFilter !== 'all' ||
    projectFilter !== 'all';

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, deptFilter, contractorFilter, projectFilter]);

  function clearFilters() {
    setSearch('');
    setDeptFilter('all');
    setContractorFilter('all');
    setProjectFilter('all');
    setPage(1);
    syncFilterUrl('all', 'all');
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
      citizenId: user.citizenId || '',
      userType: user.userType || 'EMPLOYEE',
      departmentId: user.departmentId || '',
      contractorId: user.contractorId || '',
      projectId: user.projectId || '',
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
        citizenId: form.citizenId.trim() || undefined,
        userType: form.userType || undefined,
        departmentId: form.departmentId || undefined,
        contractorId: form.contractorId || undefined,
        projectId: form.projectId || undefined,
      };
      const errors = validateUserForm({
        ...form,
        projectContractorIds: form.projectId ? projectContractorIds : undefined,
      });
      if (hasFormErrors(errors)) {
        throw new ApiError('Vui lòng kiểm tra lại thông tin đã nhập', 400);
      }
      const saved = editing
        ? await updateUser(editing.id, { ...payload, employeeCode: form.employeeCode.trim() })
        : await createUser(payload);

      const userId = saved?.id || editing?.id;
      if (form.faceImageFile) {
        if (!userId) {
          throw new ApiError('Không lấy được ID nhân viên sau khi lưu', 500);
        }
        await enrollFace(userId, form.faceImageFile);
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
    onSuccess: (result) => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      const failed = result?.deviceRemove?.failed ?? 0;
      if (failed > 0) {
        setError(
          `Đã ẩn ${result.employeeCode}; ${failed} thiết bị gỡ Face thất bại — kiểm tra panel`,
        );
        setNotice(null);
      } else {
        setNotice(`Đã ẩn ${result.employeeCode} và gỡ Face trên thiết bị`);
        setError(null);
      }
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Ẩn nhân sự thất bại'),
  });
  const deleting = deleteMutation.isPending;

  const transferMutation = useMutation({
    mutationFn: () => {
      if (!transferTarget) throw new ApiError('Chưa chọn nhân viên', 400);
      if (!transferForm.toProjectId.trim() || !transferForm.zoneId.trim()) {
        throw new ApiError('Chọn dự án đích và đúng 1 khu vực', 400);
      }
      return transferUserProject(transferTarget.id, {
        toProjectId: transferForm.toProjectId,
        zoneId: transferForm.zoneId,
        workShiftId: transferForm.workShiftId || undefined,
        note: transferForm.note.trim() || undefined,
      });
    },
    onSuccess: (result) => {
      setTransferTarget(null);
      setTransferForm({ toProjectId: '', zoneId: '', workShiftId: '', note: '' });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['permissions'] });
      setNotice(
        `Đã điều chuyển ${result.user.employeeCode} → dự án mới` +
          (result.sync.mock ? ' (mock sync)' : ` · sync ${result.sync.synced} thiết bị`),
      );
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Điều chuyển thất bại'),
  });

  function onSave() {
    const errors = validateUserForm({
      ...form,
      projectContractorIds: form.projectId ? projectContractorIds : undefined,
    });
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

  function closeImportDialog() {
    if (importing) return;
    setImportOpen(false);
    setImportExcel(null);
    setImportZip(null);
  }

  async function onImportSubmit() {
    if (!importExcel || !importZip) {
      setError('Chọn cả file Excel và file ZIP ảnh');
      return;
    }
    setImporting(true);
    setError(null);
    setImportErrors(null);
    setNotice(null);
    try {
      const result = await importUsers(importExcel, importZip);
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
      setImportOpen(false);
      setImportExcel(null);
      setImportZip(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nhập nhân sự thất bại');
    } finally {
      setImporting(false);
    }
  }

  return (
    <PageShell
      badge="Quản trị"
      title="Quản lý Nhân sự"
      subtitle="Danh sách nhân viên, phòng ban và thông tin liên hệ."
      actions={
        writeEnabled ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onDownloadTemplate()}
              disabled={loading || importing}
              title="Mẫu Excel: cột Ảnh ghi tên file (vd. nguyen-van-a.jpg). Import kèm ZIP ảnh."
            >
              <Download className="h-4 w-4" />
              Tải mẫu Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setImportExcel(null);
                setImportZip(null);
                setImportOpen(true);
              }}
              disabled={loading || importing}
              title="Chọn file Excel và ZIP ảnh"
            >
              <Upload className="h-4 w-4" />
              {importing ? 'Đang import...' : 'Import'}
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
        ) : (
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Làm mới
          </Button>
        )
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
      {(filteredContractorName || filteredProjectName) && (
        <div className="mb-4 flex flex-col gap-2 rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Đang xem NV
            {filteredContractorName ? (
              <>
                {' '}
                của nhà thầu <strong>{filteredContractorName}</strong>
              </>
            ) : null}
            {filteredProjectName ? (
              <>
                {filteredContractorName ? ',' : ''} dự án <strong>{filteredProjectName}</strong>
              </>
            ) : null}
            .
          </p>
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={clearFilters}>
            Xóa lọc nhà thầu
          </Button>
        </div>
      )}
      <MovedSettingsLinks
        sectionId="hr"
        excludePath="/users"
        title="Liên kết nhanh"
        description="Phòng ban, dự án & nhà thầu liên quan nhân sự."
      />
      <DesignCard title="Tìm kiếm & bộ lọc">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,240px)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
          <div className="min-w-0">
            <label htmlFor="user-search" className="mb-1 block text-xs text-muted-foreground">
              Tìm kiếm
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="user-search"
                placeholder="Tên, mã NV hoặc CCCD..."
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
          <div>
            <label htmlFor="user-contractor" className="mb-1 block text-xs text-muted-foreground">
              Nhà thầu
            </label>
            <Select
              id="user-contractor"
              value={contractorFilter}
              onChange={(e) => {
                const next = e.target.value;
                setContractorFilter(next);
                setProjectFilter('all');
                setPage(1);
                syncFilterUrl(next, 'all');
              }}
            >
              <option value="all">Tất cả nhà thầu</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="user-project" className="mb-1 block text-xs text-muted-foreground">
              Dự án
            </label>
            <Select
              id="user-project"
              value={projectFilter}
              onChange={(e) => {
                const next = e.target.value;
                setProjectFilter(next);
                setPage(1);
                syncFilterUrl(contractorFilter, next);
              }}
            >
              <option value="all">Tất cả dự án</option>
              {listProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-12" />
                <col className="w-[15%]" />
                <col className="w-[9%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[7.5rem]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[88px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-center font-semibold text-muted-foreground">#</th>
                  <th className="p-3 text-left font-semibold">Họ tên</th>
                  <th className="p-3 text-left font-semibold">Mã NV</th>
                  <th className="p-3 text-left font-semibold">Phòng ban</th>
                  <th className="p-3 text-left font-semibold">Nhà thầu</th>
                  <th className="p-3 text-left font-semibold">CCCD</th>
                  <th className="p-3 text-left font-semibold">Loại</th>
                  <th className="p-3 text-left font-semibold">Email</th>
                  <th className="p-3 text-left font-semibold">SĐT</th>
                  <th className="w-[120px] min-w-[120px] p-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u, i) => (
                  <tr key={u.id} className="border-t border-border transition-colors hover:bg-muted/20">
                    <td className="p-3 text-center font-mono text-xs text-muted-foreground">
                      {(currentPage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={u.fullName} src={u.faceImageUrl} />
                        <span className="truncate font-semibold">{u.fullName}</span>
                      </div>
                    </td>
                    <td className="truncate p-3 font-mono text-xs text-muted-foreground">
                      {u.employeeCode}
                    </td>
                    <td className="p-3">
                      {u.department?.name ? (
                        <Badge
                          variant="secondary"
                          title={u.department.name}
                          className="block max-w-full truncate bg-blue-100 text-xs font-medium text-blue-700"
                        >
                          {u.department.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="truncate p-3 text-xs" title={u.contractor?.name || undefined}>
                      {u.contractor?.name || '—'}
                    </td>
                    <td className="truncate p-3 font-mono text-xs">{u.citizenId || '—'}</td>
                    <td className="whitespace-nowrap p-3">
                      <Badge
                        variant="secondary"
                        className={
                          u.userType === 'CONTRACTOR'
                            ? 'whitespace-nowrap bg-amber-100 text-xs font-medium text-amber-800'
                            : 'whitespace-nowrap bg-slate-100 text-xs font-medium text-slate-700'
                        }
                      >
                        {u.userType === 'CONTRACTOR' ? 'Nhà thầu' : 'Nội bộ'}
                      </Badge>
                    </td>
                    <td className="truncate p-3 text-xs" title={u.email || undefined}>
                      {u.email || '—'}
                    </td>
                    <td className="truncate p-3 text-xs">{u.phone || '—'}</td>
                    <td className="p-3">
                      {writeEnabled ? (
                        <div className="flex items-center justify-end gap-2">
                          {u.userType === 'CONTRACTOR' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              title="Điều chuyển dự án"
                              onClick={() => {
                                setTransferTarget(u);
                                setTransferForm({
                                  toProjectId: '',
                                  zoneId: '',
                                  workShiftId: '',
                                  note: '',
                                });
                                setError(null);
                              }}
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TablePager
            className="mt-4 pt-4"
            currentPage={currentPage}
            totalPages={totalPages}
            total={total}
            unit="nhân viên"
            onPageChange={setPage}
          />
        </QueryBoundary>
      </DesignCard>

      <Dialog
        open={importOpen}
        onClose={closeImportDialog}
        title="Import nhân sự"
        description="Chọn file Excel và ZIP chứa ảnh. Cột Ảnh ghi tên file trong ZIP (vd. nguyen-van-a.jpg)."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium">File Excel (.xlsx)</label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              disabled={importing}
              onChange={(e) => setImportExcel(e.target.files?.[0] ?? null)}
            />
            {importExcel && (
              <p className="mt-1 text-xs text-muted-foreground">{importExcel.name}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">File ZIP ảnh (JPG/PNG)</label>
            <Input
              type="file"
              accept=".zip"
              disabled={importing}
              onChange={(e) => setImportZip(e.target.files?.[0] ?? null)}
            />
            {importZip && (
              <p className="mt-1 text-xs text-muted-foreground">{importZip.name}</p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Không dán ảnh vào Excel. Hệ thống tìm ảnh trong ZIP theo tên ở cột Ảnh.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={closeImportDialog} disabled={importing}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={importing || !importExcel || !importZip}
              onClick={() => void onImportSubmit()}
            >
              {importing ? 'Đang import...' : 'Import'}
            </Button>
          </div>
        </div>
      </Dialog>

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
              Mã nhân viên sẽ được tự sinh sau khi lưu theo dạng <span className="font-mono">EMPA3K9</span>.
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
            <label className="mb-1 block text-xs text-muted-foreground">CCCD</label>
            <Input
              className="input-design h-10 font-mono"
              placeholder="001234567890"
              value={form.citizenId}
              onChange={(e) => patchForm({ citizenId: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Loại NV</label>
              <Select
                value={form.userType}
                onChange={(e) => patchForm({ userType: e.target.value })}
              >
                <option value="EMPLOYEE">Nhân viên</option>
                <option value="CONTRACTOR">Nhà thầu / CN</option>
                <option value="VISITOR">Khách</option>
              </Select>
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Nhà thầu
                {form.userType === 'CONTRACTOR' ? <RequiredMark /> : null}
              </label>
              <Select
                value={form.contractorId}
                className={cn(fieldErrors.contractorId && 'border-destructive')}
                onChange={(e) =>
                  patchForm({ contractorId: e.target.value, projectId: '' })
                }
                aria-invalid={Boolean(fieldErrors.contractorId)}
              >
                <option value="">— Không chọn —</option>
                {formContractorOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <FieldError message={fieldErrors.contractorId} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Dự án</label>
              <Select
                value={form.projectId}
                onChange={(e) => {
                  const projectId = e.target.value;
                  const p = projects.find((x) => x.id === projectId);
                  const ids = p?.contractors?.map((l) => l.contractorId) ?? [];
                  const nextContractor =
                    !projectId || ids.length === 0 || ids.includes(form.contractorId)
                      ? form.contractorId
                      : '';
                  patchForm({ projectId, contractorId: nextContractor });
                }}
              >
                <option value="">— Không chọn —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {!editing && (
            <>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Khu vực ra vào (có thể chọn nhiều khu)
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
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Nhân sự chỉ được tính chấm công tại các khu vực đã chọn.
                </p>
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

      <Dialog
        open={!!transferTarget}
        onClose={() => !transferMutation.isPending && setTransferTarget(null)}
        title={`Điều chuyển dự án — ${transferTarget?.fullName ?? ''}`}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Thu hồi khu vực cũ, gán 1 khu vực mới, đồng bộ Face lên máy thuộc khu đích. Lịch sử
            điều chuyển được lưu.
          </p>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Dự án đích
              <RequiredMark />
            </label>
            <Select
              value={transferForm.toProjectId}
              onChange={(e) =>
                setTransferForm((prev) => ({ ...prev, toProjectId: e.target.value }))
              }
            >
              <option value="">— Chọn dự án —</option>
              {transferProjects
                .filter((p) => p.id !== transferTarget?.projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Khu vực mới (1 khu)
              <RequiredMark />
            </label>
            <Select
              value={transferForm.zoneId}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, zoneId: e.target.value }))}
            >
              <option value="">— Chọn khu vực —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Ca làm (tuỳ chọn)</label>
            <Select
              value={transferForm.workShiftId}
              onChange={(e) =>
                setTransferForm((prev) => ({ ...prev, workShiftId: e.target.value }))
              }
            >
              <option value="">— Giữ ca hiện tại —</option>
              {workShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Ghi chú</label>
            <Input
              className="input-design h-10"
              value={transferForm.note}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Lý do điều chuyển…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={transferMutation.isPending}
              onClick={() => setTransferTarget(null)}
            >
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={transferMutation.isPending}
              onClick={() => transferMutation.mutate()}
            >
              {transferMutation.isPending ? 'Đang chuyển…' : 'Điều chuyển'}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => onConfirmDelete()}
        title="Ẩn nhân sự"
        message={`Ẩn nhân sự ${deleteTarget?.fullName ?? ''} khỏi danh sách và gỡ Face trên thiết bị? Dữ liệu chấm công / nhật ký được giữ lại.`}
        confirmLabel="Ẩn nhân sự"
        loading={deleting}
      />
    </PageShell>
  );
}

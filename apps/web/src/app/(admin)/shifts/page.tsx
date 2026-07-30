'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Star, Search, RefreshCw, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { FieldError, RequiredMark } from '@/components/ui/field-error';
import { Badge } from '@/components/ui/badge';
import { Collapsible } from '@/components/ui/collapsible';
import { QueryBoundary } from '@/components/ui/query-states';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { UserInfiniteList } from '@/components/users/UserInfiniteList';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  bulkAssignEmployeeShift,
  createWorkShift,
  deleteEmployeeShift,
  deleteWorkShift,
  endEmployeeShift,
  getDepartments,
  getEmployeeShifts,
  getUserIds,
  getWorkShifts,
  setDefaultShift,
  updateWorkShift,
  type EmployeeShift,
  type User,
  type WorkShift,
} from '@/lib/api';
import {
  clearFieldError,
  hasFormErrors,
  validateAssignShiftForm,
  validateWorkShiftForm,
  type AssignShiftMode,
  type FieldErrors,
} from '@/lib/formValidation';
import { cn } from '@/lib/utils';
import type { EmployeeShiftAssignType } from '@/lib/api';

const EMPTY_SHIFT = {
  name: '',
  code: '',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  salaryCoefficient: 1,
  isOvernight: false,
};

function todayDateOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateOnly(raw: string | Date | null | undefined): string | null {
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

/** Còn hiệu lực nếu chưa có ngày kết thúc, hoặc ngày kết thúc vẫn ở tương lai.
 *  endDate === hôm nay → Đã kết thúc (vừa bấm Kết thúc / hết hạn trong ngày). */
function isAssignmentActive(a: EmployeeShift): boolean {
  const end = dateOnly(a.endDate);
  if (!end) return true;
  return end > todayDateOnly();
}

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editing, setEditing] = useState<WorkShift | null>(null);
  const [form, setForm] = useState(EMPTY_SHIFT);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof typeof EMPTY_SHIFT>>({});
  const [assignForm, setAssignForm] = useState({
    mode: 'RANGED' as AssignShiftMode,
    workShiftId: '',
    startDate: todayDateOnly(),
    endDate: '',
  });
  const [assignFieldErrors, setAssignFieldErrors] = useState<
    FieldErrors<'workShiftId' | 'startDate' | 'endDate' | 'selectedUserIds' | 'mode'>
  >({});
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [assignSearch, setAssignSearch] = useState('');
  const debouncedAssignSearch = useDebouncedValue(assignSearch);
  const [assignDept, setAssignDept] = useState('');
  const [assignResult, setAssignResult] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkShift | null>(null);
  const [endAssignmentTarget, setEndAssignmentTarget] = useState<EmployeeShift | null>(null);
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] = useState<EmployeeShift | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shiftsQuery = useQuery({
    queryKey: queryKeys.workShifts(),
    queryFn: () => getWorkShifts(),
  });
  const assignmentsQuery = useQuery({
    queryKey: queryKeys.employeeShifts(),
    queryFn: () => getEmployeeShifts(),
  });
  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments(),
    queryFn: () => getDepartments(),
    enabled: assignOpen,
  });
  const filterIdsQuery = useQuery({
    queryKey: ['userIds', debouncedAssignSearch, assignDept],
    queryFn: () =>
      getUserIds({
        search: debouncedAssignSearch.trim() || undefined,
        departmentId: assignDept || undefined,
      }),
    enabled: assignOpen,
  });

  const shifts = useMemo(() => shiftsQuery.data ?? [], [shiftsQuery.data]);
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);
  const deptOptions = departmentsQuery.data ?? [];
  const filterIds = filterIdsQuery.data?.ids ?? [];
  const filterTotal = filterIdsQuery.data?.total ?? 0;
  const loading = shiftsQuery.isLoading || assignmentsQuery.isLoading;
  const queryError = shiftsQuery.error ?? assignmentsQuery.error;
  const listError =
    queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Không tải được ca làm việc'
        : null;

  function load() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.workShifts() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.employeeShifts() });
  }

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a) => {
      const name = a.user?.fullName?.toLowerCase() || '';
      const code = a.user?.employeeCode?.toLowerCase() || '';
      const shift = a.workShift?.name?.toLowerCase() || '';
      return name.includes(q) || code.includes(q) || shift.includes(q);
    });
  }, [assignments, search]);

  const allFilteredSelected =
    filterIds.length > 0 && filterIds.every((id) => selectedUserIds.has(id));

  function toggleUser(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAssignFieldErrors((prev) => clearFieldError(prev, 'selectedUserIds'));
  }

  function toggleAllFiltered() {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const id of filterIds) next.delete(id);
      } else {
        for (const id of filterIds) next.add(id);
      }
      return next;
    });
    setAssignFieldErrors((prev) => clearFieldError(prev, 'selectedUserIds'));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_SHIFT);
    setFieldErrors({});
    setOpen(true);
  }

  function openEdit(shift: WorkShift) {
    setEditing(shift);
    setForm({
      name: shift.name,
      code: shift.code,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      salaryCoefficient: shift.salaryCoefficient ?? 1,
      isOvernight: shift.isOvernight,
    });
    setFieldErrors({});
    setOpen(true);
  }

  function patchForm(patch: Partial<typeof EMPTY_SHIFT>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setFieldErrors((prev) =>
      clearFieldError(prev, Object.keys(patch) as (keyof typeof EMPTY_SHIFT)[]),
    );
  }

  function patchAssignForm(patch: Partial<typeof assignForm>) {
    setAssignForm((prev) => ({ ...prev, ...patch }));
    setAssignFieldErrors((prev) =>
      clearFieldError(
        prev,
        Object.keys(patch) as ('workShiftId' | 'startDate' | 'endDate' | 'mode')[],
      ),
    );
  }

  const saveMutation = useMutation({
    // Mỗi ca được đi muộn tối đa 5 phút (sau đó mới tính LATE).
    mutationFn: () => {
      const payload = { ...form, gracePeriodMinutes: 5 };
      return editing ? updateWorkShift(editing.id, payload) : createWorkShift(payload);
    },
    onSuccess: () => {
      setError(null);
      setNotice(editing ? 'Đã cập nhật ca làm việc' : 'Đã tạo ca làm việc');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workShifts() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });
  const saving = saveMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: (target: WorkShift) => deleteWorkShift(target.id),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workShifts() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Xóa thất bại'),
  });
  const deleting = deleteMutation.isPending;

  function onSave() {
    const errors = validateWorkShiftForm(form, {
      existingShifts: shifts,
      excludeId: editing?.id,
    });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      return;
    }
    setError(null);
    saveMutation.mutate();
  }

  function onConfirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  }

  const endAssignmentMutation = useMutation({
    mutationFn: (target: EmployeeShift) => endEmployeeShift(target.id, todayDateOnly()),
    onSuccess: () => {
      setEndAssignmentTarget(null);
      setNotice('Đã kết thúc phân ca');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.employeeShifts() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Kết thúc ca thất bại'),
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (target: EmployeeShift) => deleteEmployeeShift(target.id),
    onSuccess: () => {
      setDeleteAssignmentTarget(null);
      setNotice('Đã xóa phân ca');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.employeeShifts() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Xóa phân ca thất bại'),
  });

  async function onDefault(shift: WorkShift) {
    try {
      await setDefaultShift(shift.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workShifts() });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Đặt ca mặc định thất bại');
    }
  }

  function openAssign() {
    setAssignForm({
      mode: 'RANGED',
      workShiftId: '',
      startDate: todayDateOnly(),
      endDate: '',
    });
    setAssignFieldErrors({});
    setSelectedUserIds(new Set());
    setAssignSearch('');
    setAssignDept('');
    setAssignResult(null);
    setAssignOpen(true);
  }

  const assignMutation = useMutation({
    mutationFn: () =>
      bulkAssignEmployeeShift({
        userIds: Array.from(selectedUserIds),
        workShiftId: assignForm.workShiftId,
        mode: assignForm.mode as EmployeeShiftAssignType,
        ...(assignForm.mode === 'RANGED'
          ? { startDate: assignForm.startDate, endDate: assignForm.endDate }
          : {}),
      }),
    onSuccess: (result) => {
      const modeLabel = result.mode === 'FIXED' ? 'cố định' : 'có thời hạn';
      setAssignResult(
        `Đã gán ${modeLabel} cho ${result.assigned} nhân viên${
          result.skipped > 0 ? `, bỏ qua ${result.skipped} (đã có ca hiệu lực)` : ''
        }.`,
      );
      setNotice('Gán ca thành công');
      setSelectedUserIds(new Set());
      // Keep startDate/endDate/mode/workShift as chosen after save
      void queryClient.invalidateQueries({ queryKey: queryKeys.employeeShifts() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Gán ca thất bại'),
  });

  function onAssign() {
    const errors = validateAssignShiftForm({
      ...assignForm,
      selectedCount: selectedUserIds.size,
    });
    setAssignFieldErrors(errors);
    if (hasFormErrors(errors)) {
      return;
    }
    setError(null);
    setAssignResult(null);
    assignMutation.mutate();
  }

  return (
    <PageShell
      badge="Quản trị"
      title="Ca làm việc"
      subtitle="Tạo mẫu ca, đặt ca mặc định và phân công nhân viên theo từng ca."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Làm mới
          </Button>
          <Button variant="outline" size="sm" onClick={openAssign}>
            Gán ca
          </Button>
          <Button variant="accent" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Thêm ca
          </Button>
        </>
      }
    >
      {notice && (
        <p className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <DesignCard title="Hướng dẫn sử dụng">
        <Collapsible title="Mở rộng">
          <div className="space-y-2">
            <p>
              <strong>Bước 1:</strong> Tạo các mẫu ca (giờ vào/ra, giờ nghỉ).
            </p>
            <p>
              <strong>Bước 2:</strong> Đặt một ca làm <em>ca mặc định</em> để áp dụng cho nhân viên chưa gán.
            </p>
            <p>
              <strong>Bước 3:</strong> Dùng &quot;Gán ca&quot; — chọn <em>Cố định</em> (lặp đến khi kết thúc)
              hoặc <em>Có thời hạn</em> (Từ–Đến ngày).
            </p>
          </div>
        </Collapsible>
      </DesignCard>

      <DesignCard title={`Danh sách ca (${shifts.length})`} description="Các mẫu ca làm việc trong hệ thống.">
        <QueryBoundary
          isLoading={loading}
          error={listError}
          isEmpty={shifts.length === 0}
          onRetry={() => load()}
          emptyTitle="Chưa có ca làm việc"
          emptyDescription="Tạo mẫu ca đầu tiên để bắt đầu."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Tên ca</th>
                  <th className="p-2 font-semibold">Mã</th>
                  <th className="p-2 font-semibold">Giờ làm</th>
                  <th className="p-2 font-semibold">Giờ nghỉ</th>
                  <th className="p-2 font-semibold">Hệ số lương</th>
                  <th className="p-2 font-semibold">Trạng thái</th>
                  <th className="p-2 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-2 font-semibold">{s.name}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{s.code}</td>
                    <td className="p-2">
                      {s.startTime} – {s.endTime}
                      {s.isOvernight && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          Qua đêm
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{s.breakMinutes}p</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs font-medium">
                        ×{(s.salaryCoefficient ?? 1).toLocaleString('vi-VN')}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {s.isDefault ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-xs font-medium text-emerald-700">
                          Mặc định
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Đặt làm ca mặc định"
                          onClick={() => void onDefault(s)}
                        >
                          <Star className={s.isDefault ? 'h-4 w-4 fill-amber-400 text-amber-400' : 'h-4 w-4'} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(s)}
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
        </QueryBoundary>
      </DesignCard>

      <DesignCard
        title={`Phân ca nhân viên (${filteredAssignments.length})`}
        description="Danh sách nhân viên đã được gán vào ca theo khoảng thời gian."
      >
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm nhân viên hoặc tên ca..."
              className="input-design h-10 pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <QueryBoundary
          isLoading={loading}
          isEmpty={filteredAssignments.length === 0}
          emptyTitle="Chưa có phân ca"
          emptyDescription="Dùng nút Gán ca để phân công nhân viên."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Nhân viên</th>
                  <th className="p-2 font-semibold">Ca</th>
                  <th className="p-2 font-semibold">Kiểu</th>
                  <th className="p-2 font-semibold">Từ ngày</th>
                  <th className="p-2 font-semibold">Đến ngày</th>
                  <th className="p-2 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((a) => (
                  <tr key={a.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-2">
                      <span className="font-semibold">{a.user?.fullName || a.userId}</span>
                      {a.user?.employeeCode && (
                        <span className="ml-1 font-mono text-xs text-muted-foreground">
                          ({a.user.employeeCode})
                        </span>
                      )}
                    </td>
                    <td className="p-2">{a.workShift?.name || a.workShiftId}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs font-normal">
                        {(a.assignmentType ?? (a.endDate ? 'RANGED' : 'FIXED')) === 'FIXED'
                          ? 'Cố định'
                          : 'Có thời hạn'}
                      </Badge>
                    </td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">
                      {String(a.startDate).slice(0, 10)}
                    </td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">
                      {a.endDate ? String(a.endDate).slice(0, 10) : 'Không giới hạn'}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        {isAssignmentActive(a) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => {
                              setError(null);
                              setEndAssignmentTarget(a);
                            }}
                          >
                            <StopCircle className="h-3.5 w-3.5" />
                            Kết thúc
                          </Button>
                        )}
                        {!isAssignmentActive(a) && (
                          <Badge variant="secondary" className="h-8 px-2 text-xs font-normal">
                            Đã kết thúc
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setError(null);
                            setDeleteAssignmentTarget(a);
                          }}
                          title="Xóa phân ca"
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
        </QueryBoundary>
      </DesignCard>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Sửa ca' : 'Thêm ca'}
        description="Cấu hình giờ làm và giờ nghỉ."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Tên ca
                <RequiredMark />
              </label>
              <Input
                placeholder="Ca hành chính"
                className={cn('input-design h-10', fieldErrors.name && 'border-destructive')}
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              <FieldError message={fieldErrors.name} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Mã ca
                <RequiredMark />
              </label>
              <Input
                placeholder="HC"
                className={cn('input-design h-10', fieldErrors.code && 'border-destructive')}
                value={form.code}
                onChange={(e) => patchForm({ code: e.target.value })}
                aria-invalid={Boolean(fieldErrors.code)}
              />
              <FieldError message={fieldErrors.code} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Giờ vào
                <RequiredMark />
              </label>
              <Input
                type="time"
                className={cn('input-design h-10', fieldErrors.startTime && 'border-destructive')}
                value={form.startTime}
                onChange={(e) => {
                const startTime = e.target.value;
                patchForm({
                  startTime,
                  ...(form.endTime && form.endTime <= startTime ? { isOvernight: true } : {}),
                });
              }}
                aria-invalid={Boolean(fieldErrors.startTime)}
              />
              <FieldError message={fieldErrors.startTime} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Giờ ra
                <RequiredMark />
              </label>
              <Input
                type="time"
                className={cn('input-design h-10', fieldErrors.endTime && 'border-destructive')}
                value={form.endTime}
                onChange={(e) => {
                const endTime = e.target.value;
                patchForm({
                  endTime,
                  ...(form.startTime && endTime <= form.startTime ? { isOvernight: true } : {}),
                });
              }}
                aria-invalid={Boolean(fieldErrors.endTime)}
              />
              <FieldError message={fieldErrors.endTime} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Giờ nghỉ (phút)</label>
              <Input
                type="number"
                className={cn(
                  'input-design h-10',
                  fieldErrors.breakMinutes && 'border-destructive',
                )}
                value={form.breakMinutes}
                onChange={(e) => patchForm({ breakMinutes: Number(e.target.value) })}
                aria-invalid={Boolean(fieldErrors.breakMinutes)}
              />
              <FieldError message={fieldErrors.breakMinutes} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Hệ số lương</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                className={cn(
                  'input-design h-10',
                  fieldErrors.salaryCoefficient && 'border-destructive',
                )}
                value={form.salaryCoefficient}
                onChange={(e) => patchForm({ salaryCoefficient: Number(e.target.value) })}
                aria-invalid={Boolean(fieldErrors.salaryCoefficient)}
              />
              <FieldError message={fieldErrors.salaryCoefficient} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isOvernight}
              onChange={(e) => patchForm({ isOvernight: e.target.checked })}
            />
            Ca qua đêm
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button variant="accent" size="sm" disabled={saving} onClick={() => onSave()}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Gán ca cho nhân viên"
        description="Chọn kiểu gán, ca làm việc và nhân viên."
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Kiểu gán
              <RequiredMark />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(
                  'rounded-sm border px-3 py-2 text-left text-sm transition-colors',
                  assignForm.mode === 'FIXED'
                    ? 'border-primary bg-primary/5 font-semibold text-foreground'
                    : 'border-border hover:bg-muted/40',
                )}
                onClick={() => patchAssignForm({ mode: 'FIXED' })}
              >
                <span className="block">Cố định</span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Lặp mỗi ngày đến khi kết thúc / gán lại
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-sm border px-3 py-2 text-left text-sm transition-colors',
                  assignForm.mode === 'RANGED'
                    ? 'border-primary bg-primary/5 font-semibold text-foreground'
                    : 'border-border hover:bg-muted/40',
                )}
                onClick={() => patchAssignForm({ mode: 'RANGED' })}
              >
                <span className="block">Có thời hạn</span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Chỉ áp dụng trong khoảng Từ–Đến ngày
                </span>
              </button>
            </div>
          </div>

          <div
            className={cn(
              'grid grid-cols-1 gap-3',
              assignForm.mode === 'RANGED' ? 'sm:grid-cols-3' : 'sm:grid-cols-1',
            )}
          >
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Ca
                <RequiredMark />
              </label>
              <Select
                value={assignForm.workShiftId}
                onChange={(e) => patchAssignForm({ workShiftId: e.target.value })}
                className={cn(assignFieldErrors.workShiftId && 'border-destructive')}
                aria-invalid={Boolean(assignFieldErrors.workShiftId)}
              >
                <option value="">— Chọn ca —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <FieldError message={assignFieldErrors.workShiftId} />
            </div>
            {assignForm.mode === 'RANGED' && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Từ ngày
                    <RequiredMark />
                  </label>
                  <Input
                    type="date"
                    className={cn(
                      'input-design h-10',
                      assignFieldErrors.startDate && 'border-destructive',
                    )}
                    value={assignForm.startDate}
                    max={assignForm.endDate || undefined}
                    onChange={(e) => {
                      const startDate = e.target.value;
                      const patch: Partial<typeof assignForm> = { startDate };
                      if (
                        assignForm.endDate &&
                        startDate &&
                        assignForm.endDate < startDate
                      ) {
                        patch.endDate = '';
                      }
                      patchAssignForm(patch);
                    }}
                    aria-invalid={Boolean(assignFieldErrors.startDate)}
                  />
                  <FieldError message={assignFieldErrors.startDate} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Đến ngày
                    <RequiredMark />
                  </label>
                  <Input
                    type="date"
                    className={cn(
                      'input-design h-10',
                      assignFieldErrors.endDate && 'border-destructive',
                    )}
                    value={assignForm.endDate}
                    min={assignForm.startDate || undefined}
                    onChange={(e) => patchAssignForm({ endDate: e.target.value })}
                    aria-invalid={Boolean(assignFieldErrors.endDate)}
                  />
                  <FieldError message={assignFieldErrors.endDate} />
                </div>
              </>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <label className="mb-1 block text-xs text-muted-foreground">
              Nhân viên
              <RequiredMark />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo tên hoặc mã..."
                  className="input-design h-10 pl-10"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                />
              </div>
              <Select value={assignDept} onChange={(e) => setAssignDept(e.target.value)}>
                <option value="">Tất cả phòng ban</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-2 flex items-center justify-between rounded-t-sm border border-border bg-muted/30 px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  disabled={filterTotal === 0 || filterIdsQuery.isLoading}
                />
                Chọn tất cả ({filterTotal})
              </label>
              <span className="text-xs text-muted-foreground">
                Đã chọn <strong className="text-foreground">{selectedUserIds.size}</strong>
              </span>
            </div>
            <div
              className={cn(
                'max-h-72 overflow-y-auto rounded-b-sm border border-t-0 border-border',
                assignFieldErrors.selectedUserIds && 'border-destructive',
              )}
            >
              <UserInfiniteList
                enabled={assignOpen}
                search={debouncedAssignSearch}
                departmentId={assignDept || undefined}
                emptyText="Không có nhân viên phù hợp."
                renderItem={(u: User) => (
                  <label className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/20">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u.id)}
                      onChange={() => toggleUser(u.id)}
                    />
                    <span className="flex-1 font-medium">{u.fullName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{u.employeeCode}</span>
                    <span className="w-32 truncate text-right text-xs text-muted-foreground">
                      {u.department?.name ?? '—'}
                    </span>
                  </label>
                )}
              />
            </div>
            <FieldError message={assignFieldErrors.selectedUserIds} />
          </div>

          {assignResult && (
            <p className="rounded-sm bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {assignResult}
            </p>
          )}
          {error && assignOpen && (
            <p className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="text-xs text-muted-foreground">
              {assignForm.mode === 'FIXED'
                ? 'Gán cố định sẽ thay ca cố định cũ (nếu có) và áp dụng từ hôm nay.'
                : 'Người đã có ca đang hiệu lực sẽ được bỏ qua.'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>
                Đóng
              </Button>
              <Button
                variant="accent"
                size="sm"
                disabled={assignMutation.isPending}
                onClick={() => onAssign()}
              >
                {assignMutation.isPending
                  ? 'Đang gán...'
                  : `Gán ca cho ${selectedUserIds.size} nhân viên`}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => onConfirmDelete()}
        title="Xóa ca làm việc"
        message={`Bạn có chắc muốn xóa ca ${deleteTarget?.name ?? ''}?`}
        confirmLabel="Xóa"
        loading={deleting}
      />

      <ConfirmDialog
        open={!!endAssignmentTarget}
        onClose={() => setEndAssignmentTarget(null)}
        onConfirm={() => {
          if (!endAssignmentTarget) return;
          endAssignmentMutation.mutate(endAssignmentTarget);
        }}
        title="Kết thúc phân ca"
        message={`Kết thúc ca "${endAssignmentTarget?.workShift?.name ?? ''}" của ${endAssignmentTarget?.user?.fullName ?? 'nhân viên'} vào hôm nay (${todayDateOnly()})? Trạng thái sẽ chuyển sang "Đã kết thúc".`}
        confirmLabel="Kết thúc"
        loading={endAssignmentMutation.isPending}
      />

      <ConfirmDialog
        open={!!deleteAssignmentTarget}
        onClose={() => setDeleteAssignmentTarget(null)}
        onConfirm={() => {
          if (!deleteAssignmentTarget) return;
          deleteAssignmentMutation.mutate(deleteAssignmentTarget);
        }}
        title="Xóa phân ca"
        message={`Xóa phân ca "${deleteAssignmentTarget?.workShift?.name ?? ''}" của ${deleteAssignmentTarget?.user?.fullName ?? 'nhân viên'}? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        loading={deleteAssignmentMutation.isPending}
      />
    </PageShell>
  );
}

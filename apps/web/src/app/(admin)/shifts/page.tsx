'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Star, Search, RefreshCw, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
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
  type User,
  type WorkShift,
} from '@/lib/api';

const EMPTY_SHIFT = {
  name: '',
  code: '',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  salaryCoefficient: 1,
  isOvernight: false,
};

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editing, setEditing] = useState<WorkShift | null>(null);
  const [form, setForm] = useState(EMPTY_SHIFT);
  const [assignForm, setAssignForm] = useState({
    workShiftId: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
  });
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [assignSearch, setAssignSearch] = useState('');
  const debouncedAssignSearch = useDebouncedValue(assignSearch);
  const [assignDept, setAssignDept] = useState('');
  const [assignResult, setAssignResult] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkShift | null>(null);

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
  const displayError =
    error ??
    (queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Không tải được ca làm việc'
        : null);

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
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_SHIFT);
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
    setOpen(true);
  }

  const saveMutation = useMutation({
    // Mỗi ca được đi muộn tối đa 5 phút (sau đó mới tính LATE).
    mutationFn: () => {
      const payload = { ...form, gracePeriodMinutes: 5 };
      return editing ? updateWorkShift(editing.id, payload) : createWorkShift(payload);
    },
    onSuccess: () => {
      setError(null);
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
    saveMutation.mutate();
  }

  function onConfirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  }

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
      workShiftId: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
    });
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
        startDate: assignForm.startDate,
        endDate: assignForm.endDate || undefined,
      }),
    onSuccess: (result) => {
      setAssignResult(
        `Đã gán ${result.assigned} nhân viên${
          result.skipped > 0 ? `, bỏ qua ${result.skipped} (đã có ca hiệu lực)` : ''
        }.`,
      );
      setSelectedUserIds(new Set());
      void queryClient.invalidateQueries({ queryKey: queryKeys.employeeShifts() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Gán ca thất bại'),
  });

  function onAssign() {
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
              <strong>Bước 3:</strong> Dùng &quot;Gán ca&quot; để phân công nhân viên vào ca theo khoảng thời gian.
            </p>
          </div>
        </Collapsible>
      </DesignCard>

      <DesignCard title={`Danh sách ca (${shifts.length})`} description="Các mẫu ca làm việc trong hệ thống.">
        <QueryBoundary
          isLoading={loading}
          error={displayError}
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
                    <td className="p-2 font-mono text-xs text-muted-foreground">
                      {String(a.startDate).slice(0, 10)}
                    </td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">
                      {a.endDate ? String(a.endDate).slice(0, 10) : '—'}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => void endEmployeeShift(a.id).then(() => load())}
                        >
                          <StopCircle className="h-3.5 w-3.5" />
                          Kết thúc
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void deleteEmployeeShift(a.id).then(() => load())}
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
              <label className="mb-1 block text-xs text-muted-foreground">Tên ca</label>
              <Input
                placeholder="Ca hành chính"
                className="input-design h-10"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Mã ca</label>
              <Input
                placeholder="HC"
                className="input-design h-10"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Giờ vào</label>
              <Input
                type="time"
                className="input-design h-10"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Giờ ra</label>
              <Input
                type="time"
                className="input-design h-10"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Giờ nghỉ (phút)</label>
              <Input
                type="number"
                className="input-design h-10"
                value={form.breakMinutes}
                onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Hệ số lương</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                className="input-design h-10"
                value={form.salaryCoefficient}
                onChange={(e) => setForm({ ...form, salaryCoefficient: Number(e.target.value) })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isOvernight}
              onChange={(e) => setForm({ ...form, isOvernight: e.target.checked })}
            />
            Ca qua đêm
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={saving || !form.name || !form.code}
              onClick={() => onSave()}
            >
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Gán ca cho nhân viên"
        description="Chọn ca, khoảng thời gian và tích chọn nhiều nhân viên để gán cùng lúc."
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Ca</label>
              <Select
                value={assignForm.workShiftId}
                onChange={(e) => setAssignForm({ ...assignForm, workShiftId: e.target.value })}
              >
                <option value="">— Chọn ca —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
              <Input
                type="date"
                className="input-design h-10"
                value={assignForm.startDate}
                onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Đến ngày</label>
              <Input
                type="date"
                className="input-design h-10"
                value={assignForm.endDate}
                onChange={(e) => setAssignForm({ ...assignForm, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <label className="mb-1 block text-xs text-muted-foreground">Nhân viên</label>
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
            <div className="max-h-72 overflow-y-auto rounded-b-sm border border-t-0 border-border">
              <UserInfiniteList
                enabled={assignOpen}
                search={debouncedAssignSearch}
                departmentId={assignDept || undefined}
                emptyText="Không có nhân viên phù hợp."
                renderItem={(u: User) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/20"
                  >
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
          </div>

          {assignResult && (
            <p className="rounded-sm bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {assignResult}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="text-xs text-muted-foreground">
              Người đã có ca đang hiệu lực sẽ được bỏ qua.
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>
                Đóng
              </Button>
              <Button
                variant="accent"
                size="sm"
                disabled={
                  assignMutation.isPending || selectedUserIds.size === 0 || !assignForm.workShiftId
                }
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
    </PageShell>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TablePager } from '@/components/ui/table-pager';
import { QueryBoundary } from '@/components/ui/query-states';
import { DesignCard } from '@/components/design/PageShell';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Department, WeeklyRow } from '@/lib/api';
import { getWeeklyTimesheet } from '@/lib/api';

const PAGE_SIZE = 5;
const DAY_COUNT = 30;
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Một ô = một loại công. Ưu tiên: CN > tăng ca > muộn > đúng giờ. */
type CongKind = 'late' | 'onTime' | 'ot' | 'sunday';

const CONG_META: Record<CongKind, { label: string; colorClass: string; cong: number }> = {
  late: { label: 'Đi muộn · 0.5 công', colorClass: 'bg-orange-500', cong: 0.5 },
  onTime: { label: 'Đúng giờ · 1 công', colorClass: 'bg-sky-500', cong: 1 },
  ot: { label: 'Tăng ca · 1.25 công', colorClass: 'bg-emerald-500', cong: 1.25 },
  sunday: { label: 'Làm CN · 1.5 công', colorClass: 'bg-violet-500', cong: 1.5 },
};

type MatrixSort = 'name' | 'least' | 'most';
type TriFilter = '' | 'yes' | 'no';

type DayCell = {
  date: string;
  lateMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  otMinutes: number;
  workedMinutes: number;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
};

type EmployeeWeek = {
  userId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string | null;
  totalCong: number;
  days: Map<string, DayCell>;
};

function parseDateOnly(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatDateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(dateStr: string) {
  const d = parseDateOnly(dateStr);
  return `${WEEKDAY_LABELS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function formatCong(value: number) {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function rangeDates(from: string, dayCount: number): string[] {
  const start = parseDateOnly(from);
  return Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return formatDateOnly(d);
  });
}

function isSunday(dateStr: string) {
  return parseDateOnly(dateStr).getDay() === 0;
}

function isWeekend(dateStr: string) {
  const day = parseDateOnly(dateStr).getDay();
  return day === 0 || day === 6;
}

function isPresent(day: DayCell) {
  if (day.status === 'ABSENT') return false;
  return !!(day.checkInAt || day.checkOutAt || day.workedMinutes > 0);
}

function resolveDayCong(day: DayCell | undefined): { kind: CongKind; cong: number } | null {
  if (!day || !isPresent(day)) return null;
  // Chủ nhật làm việc → 1.5
  if (isSunday(day.date)) return { kind: 'sunday', cong: CONG_META.sunday.cong };
  // Tăng ca → 1.25
  if (day.otMinutes > 0 || day.status === 'OVERTIME') return { kind: 'ot', cong: CONG_META.ot.cong };
  // Đi muộn → 0.5
  if (day.lateMinutes > 0 || day.status === 'LATE') return { kind: 'late', cong: CONG_META.late.cong };
  // Đúng giờ → 1
  return { kind: 'onTime', cong: CONG_META.onTime.cong };
}

function matchesTri(filter: TriFilter, hasValue: boolean) {
  if (filter === 'yes') return hasValue;
  if (filter === 'no') return !hasValue;
  return true;
}

function employeeHasFlag(
  emp: EmployeeWeek,
  predicate: (day: DayCell) => boolean,
): boolean {
  for (const day of emp.days.values()) {
    if (isPresent(day) && predicate(day)) return true;
  }
  return false;
}

function dayTooltip(day: DayCell | undefined): string {
  const resolved = resolveDayCong(day);
  if (!day) return 'Không có bản ghi';
  if (!resolved) return 'Vắng / không tính công';
  const parts: string[] = [`${CONG_META[resolved.kind].label}`];
  if (day.checkInAt || day.checkOutAt) {
    parts.push(`Vào ${formatTime(day.checkInAt)} · Ra ${formatTime(day.checkOutAt)}`);
  }
  return parts.join(' · ');
}

function triToBool(filter: TriFilter): boolean | undefined {
  if (filter === 'yes') return true;
  if (filter === 'no') return false;
  return undefined;
}

function groupEmployees(rows: WeeklyRow[]): EmployeeWeek[] {
  const map = new Map<string, EmployeeWeek>();
  for (const row of rows) {
    let emp = map.get(row.userId);
    if (!emp) {
      emp = {
        userId: row.userId,
        fullName: row.fullName,
        employeeCode: row.employeeCode,
        departmentName: row.departmentName,
        totalCong: 0,
        days: new Map(),
      };
      map.set(row.userId, emp);
    }
    const cell: DayCell = {
      date: row.date,
      lateMinutes: row.lateMinutes,
      earlyArrivalMinutes: row.earlyArrivalMinutes ?? 0,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      otMinutes: row.otMinutes,
      workedMinutes: row.workedMinutes,
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      status: row.status,
    };
    emp.days.set(row.date, cell);
    const resolved = resolveDayCong(cell);
    if (resolved) emp.totalCong += resolved.cong;
  }
  return Array.from(map.values());
}

function DayCellView({ day }: { day: DayCell | undefined }) {
  const resolved = resolveDayCong(day);
  if (!resolved) {
    return (
      <div className="mx-auto h-7 w-7 rounded-sm bg-muted/40" title={dayTooltip(day)} />
    );
  }

  return (
    <div
      className={cn('mx-auto h-7 w-7 rounded-sm', CONG_META[resolved.kind].colorClass)}
      title={dayTooltip(day)}
    />
  );
}

type Props = {
  rangeFrom: string;
  rangeTo: string;
  departments: Department[];
  departmentId: string;
  onDepartmentChange: (id: string) => void;
};

const COL = {
  stt: 44,
  code: 88,
  name: 168,
  dept: 132,
  day: 36,
  total: 80,
} as const;

const LEFT_WIDTH = COL.stt + COL.code + COL.name + COL.dept + COL.total;
const DAYS_WIDTH = DAY_COUNT * COL.day;
const ROW_H = 40;
const HEAD_H = 44;

export default function EmployeeWeekMatrix({
  rangeFrom,
  rangeTo,
  departments,
  departmentId,
  onDepartmentChange,
}: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MatrixSort>('name');
  const [earlyArrival, setEarlyArrival] = useState<TriFilter>('');
  const [hasOt, setHasOt] = useState<TriFilter>('');
  const [hasLate, setHasLate] = useState<TriFilter>('');
  const [page, setPage] = useState(1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);

  const matrixQuery = useQuery({
    queryKey: [
      'weeklyTimesheet',
      'matrix',
      rangeFrom,
      rangeTo,
      departmentId,
      page,
      debouncedSearch,
      sort,
      earlyArrival,
      hasOt,
      hasLate,
    ],
    queryFn: () =>
      getWeeklyTimesheet({
        from: rangeFrom,
        to: rangeTo,
        departmentId: departmentId || undefined,
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        sort,
        hasLate: triToBool(hasLate),
        hasEarlyArrival: triToBool(earlyArrival),
        hasOt: triToBool(hasOt),
      }),
  });

  const rows = matrixQuery.data?.rows ?? [];
  const isLoading = matrixQuery.isLoading;
  const error = matrixQuery.error
    ? matrixQuery.error instanceof Error
      ? matrixQuery.error.message
      : 'Không tải được bảng 30 ngày'
    : null;
  const onRetry = () => void matrixQuery.refetch();
  const totalPages = matrixQuery.data?.totalPages ?? 1;
  const totalUsers = matrixQuery.data?.totalUsers ?? 0;
  const currentPage = Math.min(page, totalPages);

  const dates = useMemo(() => rangeDates(rangeFrom, DAY_COUNT), [rangeFrom]);

  const employees = useMemo(() => groupEmployees(rows), [rows]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    sort,
    departmentId,
    rangeFrom,
    rangeTo,
    earlyArrival,
    hasOt,
    hasLate,
  ]);

  return (
    <DesignCard title={`Bảng chấm công 30 ngày gần nhất (${totalUsers})`}>
      <div className="mb-4 space-y-3">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="matrix-search" className="mb-1 block text-xs text-muted-foreground">
            Tìm kiếm
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="matrix-search"
              placeholder="Tên, mã NV, phòng ban..."
              className="input-design h-10 pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="matrix-sort" className="mb-1 block text-xs text-muted-foreground">
            Sắp xếp
          </label>
          <Select
            id="matrix-sort"
            className="h-10"
            value={sort}
            onChange={(e) => setSort(e.target.value as MatrixSort)}
          >
            <option value="name">Mặc định (A–Z)</option>
            <option value="least">Công ít nhất</option>
            <option value="most">Công nhiều nhất</option>
          </Select>
        </div>
        <div>
          <label htmlFor="matrix-dept" className="mb-1 block text-xs text-muted-foreground">
            Phòng ban
          </label>
          <Select
            id="matrix-dept"
            className="h-10"
            value={departmentId}
            onChange={(e) => onDepartmentChange(e.target.value)}
          >
            <option value="">Tất cả phòng ban</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border px-3 text-sm hover:bg-muted/30">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={hasLate === 'yes'}
              onChange={(e) => setHasLate(e.target.checked ? 'yes' : '')}
            />
            Đi muộn
          </label>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border px-3 text-sm hover:bg-muted/30">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={earlyArrival === 'yes'}
              onChange={(e) => setEarlyArrival(e.target.checked ? 'yes' : '')}
            />
            Đi sớm
          </label>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border px-3 text-sm hover:bg-muted/30">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={hasOt === 'yes'}
              onChange={(e) => setHasOt(e.target.checked ? 'yes' : '')}
            />
            Tăng ca
          </label>
        </div>
      </div>

      <QueryBoundary
        isLoading={isLoading}
        error={error}
        isEmpty={employees.length === 0}
        onRetry={onRetry}
        emptyTitle="Chưa có dữ liệu 30 ngày này"
        emptyDescription="Thử đổi khoảng ngày, phòng ban hoặc từ khóa tìm kiếm."
      >
        {/* Split pane: frozen identity cols | scrollable day cols — avoids sticky overlap bugs */}
        <div className="flex overflow-hidden rounded-sm border border-border">
          <div
            className="shrink-0 border-r border-border bg-surface"
            style={{ width: LEFT_WIDTH }}
          >
            <table
              className="border-separate border-spacing-0 text-sm"
              style={{ tableLayout: 'fixed', width: LEFT_WIDTH }}
            >
              <colgroup>
                <col style={{ width: COL.stt }} />
                <col style={{ width: COL.code }} />
                <col style={{ width: COL.name }} />
                <col style={{ width: COL.dept }} />
                <col style={{ width: COL.total }} />
              </colgroup>
              <thead>
                <tr style={{ height: HEAD_H }}>
                  <th className="border-b border-r border-border bg-muted px-1 text-center text-xs font-semibold">
                    STT
                  </th>
                  <th className="border-b border-r border-border bg-muted px-1.5 text-left text-xs font-semibold">
                    Mã NV
                  </th>
                  <th className="border-b border-r border-border bg-muted px-1.5 text-left text-xs font-semibold">
                    Họ và tên
                  </th>
                  <th className="border-b border-r border-border bg-muted px-1.5 text-left text-xs font-semibold">
                    Phòng ban
                  </th>
                  <th className="border-b border-border bg-muted px-1.5 text-right text-xs font-semibold">
                    Tổng công
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, idx) => {
                  const stt = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const hovered = hoveredId === emp.userId;
                  return (
                    <tr
                      key={emp.userId}
                      style={{ height: ROW_H }}
                      className={cn(hovered && 'bg-muted/40')}
                      onMouseEnter={() => setHoveredId(emp.userId)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <td className="border-b border-r border-border px-1 text-center text-xs text-muted-foreground">
                        {stt}
                      </td>
                      <td className="truncate border-b border-r border-border px-1.5 font-mono text-xs">
                        {emp.employeeCode || '—'}
                      </td>
                      <td
                        className="truncate border-b border-r border-border px-1.5 text-xs font-semibold"
                        title={emp.fullName}
                      >
                        {emp.fullName}
                      </td>
                      <td
                        className="truncate border-b border-r border-border px-1.5 text-xs text-muted-foreground"
                        title={emp.departmentName || undefined}
                      >
                        {emp.departmentName || '—'}
                      </td>
                      <td className="border-b border-border px-1.5 text-right text-xs font-semibold tabular-nums">
                        {formatCong(emp.totalCong)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto">
            <table
              className="border-separate border-spacing-0 text-sm"
              style={{ tableLayout: 'fixed', width: DAYS_WIDTH, minWidth: DAYS_WIDTH }}
            >
              <colgroup>
                {dates.map((date) => (
                  <col key={date} style={{ width: COL.day }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ height: HEAD_H }}>
                  {dates.map((date) => {
                    const d = parseDateOnly(date);
                    const weekend = isWeekend(date);
                    return (
                      <th
                        key={date}
                        className={cn(
                          'border-b border-border px-0 text-center text-[10px] font-semibold leading-tight',
                          weekend ? 'bg-destructive/10 text-destructive' : 'bg-muted',
                        )}
                        title={formatDayLabel(date)}
                      >
                        <span className="block">{d.getDate()}</span>
                        <span
                          className={cn(
                            'block',
                            weekend ? 'text-destructive/80' : 'text-muted-foreground',
                          )}
                        >
                          {WEEKDAY_LABELS[d.getDay()]}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const hovered = hoveredId === emp.userId;
                  return (
                    <tr
                      key={emp.userId}
                      style={{ height: ROW_H }}
                      className={cn(hovered && 'bg-muted/40')}
                      onMouseEnter={() => setHoveredId(emp.userId)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      {dates.map((date) => (
                        <td
                          key={date}
                          className={cn(
                            'border-b border-border px-0',
                            isWeekend(date) && !hovered && 'bg-destructive/5',
                          )}
                        >
                          <DayCellView day={emp.days.get(date)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {(Object.keys(CONG_META) as CongKind[]).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-sm', CONG_META[kind].colorClass)} />
              {CONG_META[kind].label}
            </span>
          ))}
        </div>

        <TablePager
          className="mt-4 pt-4"
          currentPage={currentPage}
          totalPages={totalPages}
          total={totalUsers}
          unit="nhân viên"
          onPageChange={setPage}
        />
      </QueryBoundary>
    </DesignCard>
  );
}

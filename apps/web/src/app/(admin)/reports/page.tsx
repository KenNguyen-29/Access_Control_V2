'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Search,
  RefreshCw,
  Clock3,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Users,
  FileText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { QueryBoundary } from '@/components/ui/query-states';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  downloadAttendanceTemplate,
  exportAttendance,
  getAttendanceRecords,
  getAttendanceSummary,
  getDepartments,
  getWeeklyTimesheet,
  importAttendance,
  type WeeklyRow,
} from '@/lib/api';
import EmployeeWeekMatrix from './EmployeeWeekMatrix';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatMinutes(minutes: number) {
  if (!minutes) return '0p';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}g${m > 0 ? ` ${m}p` : ''}`;
  return `${m}p`;
}

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function formatDateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local calendar date (avoids UTC shift from `new Date('YYYY-MM-DD')`). */
function parseDateOnly(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function mondayOfWeek(base: Date) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function formatDayLabel(dateStr: string) {
  const d = parseDateOnly(dateStr);
  return `${WEEKDAY_LABELS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function weekEndFromStart(start: string) {
  const d = parseDateOnly(start);
  d.setDate(d.getDate() + 6);
  return formatDateOnly(d);
}

function errMsg(err: unknown, fallback: string) {
  if (!err) return null;
  return err instanceof ApiError ? err.message : fallback;
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState('stats');

  const initialWeekStart = formatDateOnly(mondayOfWeek(new Date()));
  const initialWeekEnd = weekEndFromStart(initialWeekStart);

  // ── Shared filters (input vs applied) ──────────
  const [from, setFrom] = useState(initialWeekStart);
  const [to, setTo] = useState(initialWeekEnd);
  const [departmentId, setDepartmentId] = useState('');
  const [applied, setApplied] = useState({
    from: initialWeekStart,
    to: initialWeekEnd,
    departmentId: '',
  });

  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [recordsPage, setRecordsPage] = useState(1);
  const [matrixDeptId, setMatrixDeptId] = useState('');
  const [timesheetSort, setTimesheetSort] = useState<'name' | 'least' | 'most'>('name');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const RECORDS_PAGE_SIZE = 10;
  const MATRIX_DAY_COUNT = 30;
  const matrixRange = useMemo(() => {
    const to = applied.to || formatDateOnly(new Date());
    const end = parseDateOnly(to);
    const start = new Date(end);
    start.setDate(end.getDate() - (MATRIX_DAY_COUNT - 1));
    return { from: formatDateOnly(start), to };
  }, [applied.to]);

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments(),
    queryFn: () => getDepartments(),
  });
  const departments = departmentsQuery.data ?? [];

  // Each tab only fetches when active; results stay cached on revisit.
  const summaryQuery = useQuery({
    queryKey: queryKeys.attendanceSummary(applied),
    queryFn: () =>
      getAttendanceSummary({
        from: applied.from,
        to: applied.to,
        departmentId: applied.departmentId || undefined,
      }),
    enabled: tab === 'stats',
    refetchInterval: tab === 'stats' ? 30_000 : false,
    refetchIntervalInBackground: true,
  });
  const summary = summaryQuery.data ?? null;

  const weeklyQuery = useQuery({
    queryKey: queryKeys.weeklyTimesheet({ weekStart, departmentId: applied.departmentId }),
    queryFn: () =>
      getWeeklyTimesheet({
        weekStart,
        departmentId: applied.departmentId || undefined,
      }),
    enabled: tab === 'stats',
    refetchInterval: tab === 'stats' ? 30_000 : false,
    refetchIntervalInBackground: true,
  });
  const weekly = weeklyQuery.data ?? null;

  const recordsQuery = useQuery({
    queryKey: queryKeys.attendanceRecords({
      from: applied.from,
      to: applied.to,
      page: recordsPage,
      pageSize: RECORDS_PAGE_SIZE,
    }),
    queryFn: () =>
      getAttendanceRecords({
        page: recordsPage,
        pageSize: RECORDS_PAGE_SIZE,
        from: applied.from || undefined,
        to: applied.to || undefined,
      }),
    enabled: tab === 'detail',
  });
  const records = recordsQuery.data?.items ?? [];
  const recordsTotal = recordsQuery.data?.total ?? 0;
  const recordsTotalPages = Math.max(1, recordsQuery.data?.totalPages ?? 1);
  const recordsCurrentPage = Math.min(recordsPage, recordsTotalPages);

  const detailWeeklyQuery = useQuery({
    queryKey: queryKeys.weeklyTimesheet({
      from: matrixRange.from,
      to: matrixRange.to,
      departmentId: matrixDeptId,
      scope: 'detail-matrix',
    }),
    queryFn: () =>
      getWeeklyTimesheet({
        from: matrixRange.from,
        to: matrixRange.to,
        departmentId: matrixDeptId || undefined,
      }),
    enabled: tab === 'detail',
  });
  const detailWeekly = detailWeeklyQuery.data ?? null;

  const statsLoading = summaryQuery.isLoading;
  const statsError = errMsg(summaryQuery.error, 'Không tải được thống kê');
  const weeklyLoading = weeklyQuery.isLoading;
  const weeklyError = errMsg(weeklyQuery.error, 'Không tải được bảng tuần');
  const detailLoading = recordsQuery.isLoading;
  const detailError = exportError ?? errMsg(recordsQuery.error, 'Không tải được báo cáo');
  const matrixLoading = detailWeeklyQuery.isLoading;
  const matrixError = errMsg(detailWeeklyQuery.error, 'Không tải được bảng 30 ngày');

  function loadSummary() {
    void summaryQuery.refetch();
  }
  function loadWeekly() {
    void weeklyQuery.refetch();
  }
  function loadDetail() {
    void recordsQuery.refetch();
  }
  function loadMatrix() {
    void detailWeeklyQuery.refetch();
  }

  function applyWeekRange(start: string, dept = departmentId) {
    const end = weekEndFromStart(start);
    setFrom(start);
    setTo(end);
    setMatrixDeptId(dept);
    setApplied({ from: start, to: end, departmentId: dept });
  }

  function onFilter() {
    setRecordsPage(1);
    setMatrixDeptId(departmentId);
    setApplied({ from, to, departmentId });
    setWeekStart(formatDateOnly(mondayOfWeek(parseDateOnly(from))));
  }

  function shiftWeek(deltaDays: number) {
    const d = parseDateOnly(weekStart);
    d.setDate(d.getDate() + deltaDays);
    const newStart = formatDateOnly(mondayOfWeek(d));
    setWeekStart(newStart);
    applyWeekRange(newStart);
  }

  function currentWeek() {
    const newStart = formatDateOnly(mondayOfWeek(new Date()));
    setWeekStart(newStart);
    applyWeekRange(newStart);
  }

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportAttendance({
        from: applied.from || undefined,
        to: applied.to || undefined,
      });
      downloadBlob(blob, `cham-cong-${formatDateOnly(new Date())}.xlsx`);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'Xuất Excel thất bại');
    } finally {
      setExporting(false);
    }
  }

  async function onDownloadTemplate() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await downloadAttendanceTemplate();
      downloadBlob(blob, 'mau-cham-cong.xlsx');
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'Tải mẫu thất bại');
    } finally {
      setExporting(false);
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setExportError(null);
    setImportNotice(null);
    try {
      const result = await importAttendance(file);
      const errPart =
        result.errors.length > 0 ? `, ${result.errors.length} cảnh báo/lỗi` : '';
      setImportNotice(
        `Import xong: tạo ${result.created}, cập nhật ${result.updated}, bỏ qua ${result.skipped}${errPart}.`,
      );
      if (result.errors.length > 0) {
        const preview = result.errors
          .slice(0, 5)
          .map((e) => `Dòng ${e.row}: ${e.message}`)
          .join(' · ');
        setExportError(preview + (result.errors.length > 5 ? ' …' : ''));
      }
      void queryClient.invalidateQueries({ queryKey: ['attendanceRecords'] });
      void queryClient.invalidateQueries({ queryKey: ['attendanceSummary'] });
      void queryClient.invalidateQueries({ queryKey: ['weeklyTimesheet'] });
      setRecordsPage(1);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : 'Nhập Excel thất bại');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  const kpis = useMemo(() => {
    const s = summary?.summary;
    return [
      { icon: FileText, label: 'Bản ghi', value: s?.totalRecords ?? 0, tone: 'text-foreground' },
      { icon: Users, label: 'Nhân sự', value: s?.staffCount ?? 0, tone: 'text-sky-600' },
      { icon: CheckCircle2, label: 'Có mặt', value: s?.presentCount ?? 0, tone: 'text-emerald-600' },
      { icon: Clock3, label: 'Đi muộn', value: s?.lateCount ?? 0, tone: 'text-orange-600' },
      { icon: LogOut, label: 'Về sớm', value: s?.earlyLeaveCount ?? 0, tone: 'text-orange-600' },
      {
        icon: TrendingUp,
        label: 'Giờ làm',
        value: formatMinutes(s?.workedMinutes ?? 0),
        tone: 'text-sky-600',
      },
      {
        icon: TrendingUp,
        label: 'OT',
        value: formatMinutes(s?.otMinutes ?? 0),
        tone: 'text-emerald-600',
      },
    ];
  }, [summary]);

  const weeklyGroups = useMemo(() => {
    const map = new Map<string, { fullName: string; employeeCode: string; rows: WeeklyRow[] }>();
    for (const row of weekly?.rows ?? []) {
      let group = map.get(row.userId);
      if (!group) {
        group = { fullName: row.fullName, employeeCode: row.employeeCode, rows: [] };
        map.set(row.userId, group);
      }
      group.rows.push(row);
    }
    return Array.from(map.values());
  }, [weekly]);

  const sortedTimesheet = useMemo(() => {
    const list = [...(summary?.timesheet ?? [])];
    list.sort((a, b) => {
      if (timesheetSort === 'least') return a.workedMinutes - b.workedMinutes;
      if (timesheetSort === 'most') return b.workedMinutes - a.workedMinutes;
      return a.fullName.localeCompare(b.fullName, 'vi');
    });
    return list;
  }, [summary?.timesheet, timesheetSort]);

  return (
    <PageShell
      badge="Báo cáo"
      title="Báo cáo chấm công"
      subtitle="Thống kê chấm công và chi tiết nhân viên 30 ngày gần nhất."
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full max-w-sm">
          <TabsTrigger value="stats">Thống kê</TabsTrigger>
          <TabsTrigger value="detail">Chi tiết</TabsTrigger>
        </TabsList>

        {/* ── Filter card (shared) ── */}
        <DesignCard title="Tìm kiếm & bộ lọc" className="mt-4">
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <div>
              <label htmlFor="report-from" className="mb-1 block text-xs text-muted-foreground">
                Từ ngày
              </label>
              <Input
                id="report-from"
                type="date"
                className="input-design h-10"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="report-to" className="mb-1 block text-xs text-muted-foreground">
                Đến ngày
              </label>
              <Input
                id="report-to"
                type="date"
                className="input-design h-10"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="report-dept" className="mb-1 block text-xs text-muted-foreground">
                Phòng ban
              </label>
              <Select
                id="report-dept"
                className="h-10"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="accent" size="sm" className="h-10" onClick={onFilter}>
              <Search className="h-4 w-4" />
              Lọc
            </Button>
          </div>
        </DesignCard>

        {/* ═══ TAB: THỐNG KÊ ═══ */}
        <TabsContent value="stats" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
            {kpis.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3 rounded-sm border border-border bg-surface p-4"
              >
                <div className="rounded-sm bg-secondary/20 p-2.5">
                  <s.icon className={cn('h-5 w-5', s.tone)} />
                </div>
                <div>
                  <p className="mb-0.5 text-label-caps uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <p className={cn('font-heading text-lg font-bold', s.tone)}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          <DesignCard
            title={`Bảng tổng hợp công (${sortedTimesheet.length})`}
            description="Tổng hợp công theo từng nhân viên trong khoảng thời gian đã chọn (đồng bộ với tuần đang xem). Giờ làm cập nhật liên tục kể cả khi chưa check-out."
            actions={
              <div className="w-[180px]">
                <Select
                  id="timesheet-sort"
                  className="h-9"
                  value={timesheetSort}
                  onChange={(e) =>
                    setTimesheetSort(e.target.value as 'name' | 'least' | 'most')
                  }
                  aria-label="Sắp xếp bảng tổng hợp công"
                >
                  <option value="name">Mặc định (A–Z)</option>
                  <option value="least">Làm ít nhất</option>
                  <option value="most">Làm nhiều nhất</option>
                </Select>
              </div>
            }
          >
            <QueryBoundary
              isLoading={statsLoading}
              error={statsError}
              isEmpty={sortedTimesheet.length === 0}
              onRetry={() => loadSummary()}
              emptyTitle="Chưa có dữ liệu"
              emptyDescription="Chọn khoảng thời gian khác hoặc chờ dữ liệu chấm công."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="p-2 font-semibold">Nhân viên</th>
                      <th className="p-2 font-semibold">Phòng ban</th>
                      <th className="p-2 text-right font-semibold">Ngày công</th>
                      <th className="p-2 text-right font-semibold">Giờ làm</th>
                      <th className="p-2 text-right font-semibold">Đi muộn</th>
                      <th className="p-2 text-right font-semibold">Về sớm</th>
                      <th className="p-2 text-right font-semibold">OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTimesheet.map((t) => (
                      <tr key={t.userId} className="border-t border-border hover:bg-muted/20">
                        <td className="p-2">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={t.fullName} />
                            <div>
                              <p className="font-semibold">{t.fullName}</p>
                              <p className="font-mono text-xs text-muted-foreground">{t.employeeCode}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-2 text-muted-foreground">{t.departmentName ?? '—'}</td>
                        <td className="p-2 text-right font-semibold">{t.daysWorked}</td>
                        <td className="p-2 text-right">{formatMinutes(t.workedMinutes)}</td>
                        <td className={cn('p-2 text-right', t.lateCount > 0 && 'text-orange-600')}>
                          {t.lateCount}
                        </td>
                        <td className={cn('p-2 text-right', t.earlyCount > 0 && 'text-orange-600')}>
                          {t.earlyCount}
                        </td>
                        <td className={cn('p-2 text-right', t.otMinutes > 0 && 'text-emerald-600')}>
                          {formatMinutes(t.otMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </QueryBoundary>
          </DesignCard>

          <DesignCard
            title="Chấm công theo tuần"
            description="Chi tiết chấm công từng ngày theo nhân viên, kèm hệ số lương của ca."
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftWeek(-7)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={currentWeek}
                  className="min-w-[150px] rounded-sm border border-border bg-muted/30 px-3 py-1.5 text-center text-xs font-medium hover:bg-muted"
                  title="Về tuần hiện tại"
                >
                  {weekly ? `${formatDayLabel(weekly.weekStart)} – ${formatDayLabel(weekly.weekEnd)}` : '—'}
                </button>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftWeek(7)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            }
          >
            <QueryBoundary
              isLoading={weeklyLoading}
              error={weeklyError}
              isEmpty={(weekly?.rows.length ?? 0) === 0}
              onRetry={() => loadWeekly()}
              emptyTitle="Chưa có dữ liệu tuần này"
              emptyDescription="Chuyển sang tuần khác hoặc chờ dữ liệu chấm công."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="p-2 font-semibold">Nhân viên</th>
                      <th className="p-2 font-semibold">Ngày</th>
                      <th className="p-2 font-semibold">Ca</th>
                      <th className="p-2 font-semibold">Giờ vào</th>
                      <th className="p-2 font-semibold">Giờ ra</th>
                      <th className="p-2 text-right font-semibold">Giờ làm</th>
                      <th className="p-2 text-right font-semibold">Đi muộn</th>
                      <th className="p-2 text-right font-semibold">Đi sớm</th>
                      <th className="p-2 text-right font-semibold">OT</th>
                      <th className="p-2 text-right font-semibold">Hệ số</th>
                      <th className="p-2 font-semibold">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyGroups.map((group) =>
                      group.rows.map((r, idx) => (
                        <tr
                          key={`${r.userId}-${r.date}`}
                          className={cn(
                            'border-t border-border hover:bg-muted/20',
                            idx === 0 && 'border-t-2 border-t-border/80',
                          )}
                        >
                          <td className="p-2">
                            {idx === 0 ? (
                              <div>
                                <p className="font-semibold">{group.fullName}</p>
                                <p className="font-mono text-xs text-muted-foreground">
                                  {group.employeeCode}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">↳</span>
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs text-muted-foreground">
                            {formatDayLabel(r.date)}
                          </td>
                          <td className="p-2">
                            {r.shiftName ? (
                              <span>
                                {r.shiftName}
                                {r.shiftCode && (
                                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                                    ({r.shiftCode})
                                  </span>
                                )}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs">{formatTime(r.checkInAt)}</td>
                          <td className="p-2 font-mono text-xs">{formatTime(r.checkOutAt)}</td>
                          <td className="p-2 text-right font-medium">
                            {r.workedMinutes > 0 ? formatMinutes(r.workedMinutes) : '—'}
                            {!r.checkOutAt && r.checkInAt && (
                              <span className="ml-1 text-[10px] text-sky-600">(tạm)</span>
                            )}
                          </td>
                          <td className={cn('p-2 text-right', r.lateMinutes > 0 && 'text-orange-600')}>
                            {r.lateMinutes > 0 ? formatMinutes(r.lateMinutes) : '—'}
                          </td>
                          <td className={cn('p-2 text-right', r.earlyLeaveMinutes > 0 && 'text-orange-600')}>
                            {r.earlyLeaveMinutes > 0 ? formatMinutes(r.earlyLeaveMinutes) : '—'}
                          </td>
                          <td className={cn('p-2 text-right', r.otMinutes > 0 && 'text-emerald-600')}>
                            {r.otMinutes > 0 ? formatMinutes(r.otMinutes) : '—'}
                          </td>
                          <td className="p-2 text-right">
                            <Badge variant="outline" className="text-xs">
                              ×{r.salaryCoefficient.toLocaleString('vi-VN')}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <StatusBadge status={r.status} />
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </QueryBoundary>
          </DesignCard>
        </TabsContent>

        {/* ═══ TAB: CHI TIẾT ═══ */}
        <TabsContent value="detail" className="space-y-6">
          {importNotice && (
            <p className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              {importNotice}
            </p>
          )}

          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => void onImportFile(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadDetail()}
                disabled={detailLoading}
              >
                <RefreshCw className={detailLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                Làm mới
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onDownloadTemplate()}
                disabled={exporting || importing}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Tải mẫu
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => importInputRef.current?.click()}
                disabled={exporting || importing}
              >
                <Upload className="h-4 w-4" />
                {importing ? 'Đang nhập...' : 'Nhập Excel'}
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={() => void onExport()}
                disabled={exporting || importing}
              >
                <Download className="h-4 w-4" />
                {exporting ? 'Đang xuất...' : 'Xuất Excel'}
              </Button>
            </div>
          </div>

          <DesignCard
            title={`Bản ghi chấm công (${recordsTotal})`}
            description="Chi tiết chấm công theo bộ lọc."
          >
            <QueryBoundary
              isLoading={detailLoading}
              error={detailError}
              isEmpty={records.length === 0}
              onRetry={() => loadDetail()}
              emptyTitle="Chưa có bản ghi"
              emptyDescription="Chọn khoảng thời gian khác hoặc chờ dữ liệu chấm công."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="p-2 font-semibold">Ngày</th>
                      <th className="p-2 font-semibold">Nhân viên</th>
                      <th className="p-2 font-semibold">Ca</th>
                      <th className="p-2 font-semibold">Vào</th>
                      <th className="p-2 font-semibold">Ra</th>
                      <th className="p-2 font-semibold">Trạng thái</th>
                      <th className="p-2 font-semibold">Muộn / OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                        <td className="p-2 font-mono text-xs text-muted-foreground">
                          {String(r.date).slice(0, 10)}
                        </td>
                        <td className="p-2">
                          <span className="font-semibold">{r.user?.fullName || r.userId}</span>
                          {r.user?.employeeCode && (
                            <span className="ml-1 font-mono text-xs text-muted-foreground">
                              ({r.user.employeeCode})
                            </span>
                          )}
                        </td>
                        <td className="p-2">{r.workShift?.name || '—'}</td>
                        <td className="p-2 font-mono text-xs">{formatDt(r.checkInAt)}</td>
                        <td className="p-2 font-mono text-xs">{formatDt(r.checkOutAt)}</td>
                        <td className="p-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="p-2 text-xs">
                          <span className={(r.lateMinutes ?? 0) > 0 ? 'text-orange-600' : 'text-muted-foreground'}>
                            {r.lateMinutes ?? 0}p
                          </span>
                          <span className="text-muted-foreground"> / </span>
                          <span className={(r.otMinutes ?? 0) > 0 ? 'text-emerald-600' : 'text-muted-foreground'}>
                            {r.otMinutes ?? 0}p
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {recordsTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    Trang {recordsCurrentPage} / {recordsTotalPages} · {recordsTotal} bản ghi
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={recordsCurrentPage <= 1}
                      onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={recordsCurrentPage >= recordsTotalPages}
                      onClick={() => setRecordsPage((p) => Math.min(recordsTotalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </QueryBoundary>
          </DesignCard>

          <EmployeeWeekMatrix
            rows={detailWeekly?.rows ?? []}
            rangeFrom={matrixRange.from}
            rangeTo={matrixRange.to}
            departments={departments}
            departmentId={matrixDeptId}
            onDepartmentChange={setMatrixDeptId}
            isLoading={matrixLoading}
            error={matrixError}
            onRetry={loadMatrix}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

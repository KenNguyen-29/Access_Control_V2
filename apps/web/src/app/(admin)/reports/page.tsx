'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/hooks/useSocket';
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
  ChevronLeft,
  ChevronRight,
  Upload,
  FileSpreadsheet,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TablePager } from '@/components/ui/table-pager';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { QueryBoundary } from '@/components/ui/query-states';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { ImagePreviewDialog } from '@/components/ui/image-preview-dialog';
import { FieldError, RequiredMark } from '@/components/ui/field-error';
import {
  hasFormErrors,
  validateFilterDateRange,
  type FieldErrors,
} from '@/lib/formValidation';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  downloadAttendanceTemplate,
  exportAttendance,
  getAccessLogs,
  getAttendanceRecords,
  getAttendanceSummary,
  getDepartments,
  getWeeklyTimesheet,
  importAttendance,
  type AccessLog,
  type WeeklyRow,
} from '@/lib/api';
import { AccessLogDetailDialog } from '@/components/attendance/AccessLogDetailDialog';
import {
  PersonHistoryDialog,
  type PersonHistoryTarget,
} from '@/components/attendance/PersonHistoryDialog';
import { ReportsLogsConfigPanel } from '@/components/reports/ReportsLogsConfigPanel';
import EmployeeWeekMatrix from './EmployeeWeekMatrix';
import {
  accessLogActionLabel,
  accessLogKindLabel,
} from '@/lib/accessLogLabels';

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
  return h > 0 ? `${h}h ${m}p` : `${m}p`;
}

/** Thumbnail pair: check-in / check-out live snapshots — click opens modal (not new tab). */
function PunchSnapshotCell({
  checkInUrl,
  checkOutUrl,
  name,
}: {
  checkInUrl?: string | null;
  checkOutUrl?: string | null;
  name?: string;
}) {
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);

  const thumb = (url: string | null | undefined, label: string) => {
    if (!url) {
      return (
        <div
          className="flex h-11 w-11 items-center justify-center rounded border border-dashed border-border bg-muted/40 text-[9px] text-muted-foreground"
          title={`Chưa có ảnh ${label.toLowerCase()}`}
        >
          {label}
        </div>
      );
    }
    return (
      <button
        type="button"
        className="group relative block h-11 w-11 overflow-hidden rounded border border-border bg-muted"
        title={`Ảnh ${label.toLowerCase()} — bấm xem lớn`}
        onClick={() =>
          setPreview({
            src: url,
            title: `${name ? `${name} · ` : ''}Ảnh ${label.toLowerCase()}`,
          })
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${name ?? 'NV'} · ${label}`}
          className="h-full w-full object-cover transition group-hover:opacity-90"
        />
        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-px text-center text-[8px] font-semibold uppercase tracking-wide text-white">
          {label}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        {thumb(checkInUrl, 'Vào')}
        {thumb(checkOutUrl, 'Ra')}
      </div>
      <ImagePreviewDialog
        open={!!preview}
        src={preview?.src ?? null}
        title={preview?.title}
        onClose={() => setPreview(null)}
      />
    </>
  );
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

type TriFilter = '' | 'yes' | 'no';

function matchesTri(filter: TriFilter, hasValue: boolean) {
  if (filter === 'yes') return hasValue;
  if (filter === 'no') return !hasValue;
  return true;
}

function triToBool(filter: TriFilter): boolean | undefined {
  if (filter === 'yes') return true;
  if (filter === 'no') return false;
  return undefined;
}

const ATTENDANCE_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ON_TIME', label: 'Đúng giờ' },
  { value: 'LATE', label: 'Đi muộn' },
  { value: 'EARLY_LEAVE', label: 'Về sớm' },
  { value: 'OVERTIME', label: 'Tăng ca' },
  { value: 'ABSENT', label: 'Vắng' },
] as const;

/** Checked = chỉ hiện bản ghi có cờ đó; bỏ chọn = không lọc. */
function FlagCheckbox({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: TriFilter;
  onChange: (v: TriFilter) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border px-3 text-sm hover:bg-muted/30"
    >
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={value === 'yes'}
        onChange={(e) => onChange(e.target.checked ? 'yes' : '')}
      />
      <span>{label}</span>
    </label>
  );
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { lastEvent } = useSocket();
  const lastHandledLogEventKey = useRef<string | null>(null);
  const deepLinkApplied = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState('stats');

  const initialWeekStart = formatDateOnly(mondayOfWeek(new Date()));
  const initialWeekEnd = weekEndFromStart(initialWeekStart);

  // ── Shared filters (input vs applied) ──────────
  const [from, setFrom] = useState(initialWeekStart);
  const [to, setTo] = useState(initialWeekEnd);
  const [dateErrors, setDateErrors] = useState<FieldErrors<'from' | 'to'>>({});
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
  const [timesheetSearch, setTimesheetSearch] = useState('');
  const [timesheetLate, setTimesheetLate] = useState<TriFilter>('');
  const [timesheetEarlyArrival, setTimesheetEarlyArrival] = useState<TriFilter>('');
  const [timesheetOt, setTimesheetOt] = useState<TriFilter>('');
  const [weeklySearch, setWeeklySearch] = useState('');
  const [weeklyStatus, setWeeklyStatus] = useState('');
  const [weeklyLate, setWeeklyLate] = useState<TriFilter>('');
  const [weeklyEarlyArrival, setWeeklyEarlyArrival] = useState<TriFilter>('');
  const [weeklyOt, setWeeklyOt] = useState<TriFilter>('');
  const [weeklyPage, setWeeklyPage] = useState(1);
  const [timesheetPage, setTimesheetPage] = useState(1);
  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsStatus, setRecordsStatus] = useState('');
  const [recordsLate, setRecordsLate] = useState<TriFilter>('');
  const [recordsOt, setRecordsOt] = useState<TriFilter>('');
  const debouncedRecordsSearch = useDebouncedValue(recordsSearch, 300);
  const [logsPage, setLogsPage] = useState(1);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsAction, setLogsAction] = useState('');
  const [logsKind, setLogsKind] = useState<'attendance' | 'movement' | ''>('');
  const [logsValidity, setLogsValidity] = useState('');
  const debouncedLogsSearch = useDebouncedValue(logsSearch, 300);
  const [selectedAccessLog, setSelectedAccessLog] = useState<AccessLog | null>(null);
  const [historyPerson, setHistoryPerson] = useState<PersonHistoryTarget | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  useEffect(() => {
    if (deepLinkApplied.current) return;
    const tabParam = searchParams.get('tab');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const searchParam = searchParams.get('search');
    if (!tabParam && !fromParam && !toParam && !searchParam) return;
    deepLinkApplied.current = true;

    if (
      tabParam === 'detail' ||
      tabParam === 'stats' ||
      tabParam === 'summary' ||
      tabParam === 'logs'
    ) {
      setTab(tabParam);
    }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const nextFrom = fromParam && dateRe.test(fromParam) ? fromParam : null;
    const nextTo = toParam && dateRe.test(toParam) ? toParam : null;
    if (nextFrom || nextTo) {
      const f = nextFrom ?? nextTo!;
      const t = nextTo ?? nextFrom!;
      setFrom(f);
      setTo(t);
      setApplied((prev) => ({ ...prev, from: f, to: t }));
      setWeekStart(formatDateOnly(mondayOfWeek(parseDateOnly(f))));
    }

    if (searchParam?.trim()) {
      setRecordsSearch(searchParam.trim());
      setRecordsPage(1);
    }
  }, [searchParams]);

  const RECORDS_PAGE_SIZE = 10;
  const LOGS_PAGE_SIZE = 10;
  const WEEKLY_PAGE_SIZE = 10;
  const TIMESHEET_PAGE_SIZE = 10;
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
  const debouncedTimesheetSearch = useDebouncedValue(timesheetSearch, 300);
  const debouncedWeeklySearch = useDebouncedValue(weeklySearch, 300);

  const summaryQuery = useQuery({
    queryKey: queryKeys.attendanceSummary({
      ...applied,
      timesheetPage,
      timesheetSearch: debouncedTimesheetSearch,
      timesheetSort,
      timesheetLate,
      timesheetEarlyArrival,
      timesheetOt,
    }),
    queryFn: () =>
      getAttendanceSummary({
        from: applied.from,
        to: applied.to,
        departmentId: applied.departmentId || undefined,
        page: tab === 'summary' ? timesheetPage : 1,
        pageSize: tab === 'summary' ? TIMESHEET_PAGE_SIZE : 1,
        search: tab === 'summary' ? debouncedTimesheetSearch.trim() || undefined : undefined,
        sort: tab === 'summary' ? timesheetSort : 'name',
        hasLate: tab === 'summary' ? triToBool(timesheetLate) : undefined,
        hasEarlyArrival: tab === 'summary' ? triToBool(timesheetEarlyArrival) : undefined,
        hasOt: tab === 'summary' ? triToBool(timesheetOt) : undefined,
      }),
    enabled: tab === 'stats' || tab === 'summary',
    refetchInterval: tab === 'stats' || tab === 'summary' ? 30_000 : false,
    refetchIntervalInBackground: true,
  });
  const summary = summaryQuery.data ?? null;

  const weeklyQuery = useQuery({
    queryKey: queryKeys.weeklyTimesheet({
      weekStart,
      departmentId: applied.departmentId,
      weeklyPage,
      weeklySearch: debouncedWeeklySearch,
      weeklyStatus,
      weeklyLate,
      weeklyEarlyArrival,
      weeklyOt,
    }),
    queryFn: () =>
      getWeeklyTimesheet({
        weekStart,
        departmentId: applied.departmentId || undefined,
        page: weeklyPage,
        pageSize: WEEKLY_PAGE_SIZE,
        search: debouncedWeeklySearch.trim() || undefined,
        status: weeklyStatus || undefined,
        hasLate: triToBool(weeklyLate),
        hasEarlyArrival: triToBool(weeklyEarlyArrival),
        hasOt: triToBool(weeklyOt),
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
      departmentId: applied.departmentId,
      page: recordsPage,
      pageSize: RECORDS_PAGE_SIZE,
      search: debouncedRecordsSearch.trim() || undefined,
      status: recordsStatus || undefined,
      hasLate: triToBool(recordsLate),
      hasOt: triToBool(recordsOt),
    }),
    queryFn: () =>
      getAttendanceRecords({
        page: recordsPage,
        pageSize: RECORDS_PAGE_SIZE,
        from: applied.from || undefined,
        to: applied.to || undefined,
        departmentId: applied.departmentId || undefined,
        search: debouncedRecordsSearch.trim() || undefined,
        status: recordsStatus || undefined,
        hasLate: triToBool(recordsLate),
        hasOt: triToBool(recordsOt),
      }),
    enabled: tab === 'detail',
  });
  const records = recordsQuery.data?.items ?? [];
  const recordsTotal = recordsQuery.data?.total ?? 0;
  const recordsTotalPages = Math.max(1, recordsQuery.data?.totalPages ?? 1);
  const recordsCurrentPage = Math.min(recordsPage, recordsTotalPages);

  const logsQuery = useQuery({
    queryKey: queryKeys.accessLogs({
      from: applied.from,
      to: applied.to,
      departmentId: applied.departmentId,
      page: logsPage,
      pageSize: LOGS_PAGE_SIZE,
      search: debouncedLogsSearch.trim() || undefined,
      action: logsAction || undefined,
      kind: logsKind || undefined,
      isValid: logsValidity === '' ? undefined : logsValidity === 'true',
    }),
    queryFn: () =>
      getAccessLogs({
        page: logsPage,
        pageSize: LOGS_PAGE_SIZE,
        from: applied.from || undefined,
        to: applied.to || undefined,
        departmentId: applied.departmentId || undefined,
        search: debouncedLogsSearch.trim() || undefined,
        action: logsAction === 'UNKNOWN' ? undefined : logsAction || undefined,
        unknownOnly: logsAction === 'UNKNOWN' || undefined,
        kind: logsKind || undefined,
        isValid: logsValidity === '' ? undefined : logsValidity === 'true',
      }),
    enabled: tab === 'logs',
    refetchInterval: tab === 'logs' ? 30_000 : false,
    refetchIntervalInBackground: true,
  });
  const accessLogs = logsQuery.data?.items ?? [];
  const logsTotal = logsQuery.data?.total ?? 0;
  const logsTotalPages = Math.max(1, logsQuery.data?.totalPages ?? 1);
  const logsCurrentPage = Math.min(logsPage, logsTotalPages);

  // Real-time: refresh log list when a new check-in/out arrives via socket.
  useEffect(() => {
    if (tab !== 'logs' || !lastEvent?.id) return;
    const eventKey = `${lastEvent.id}:${lastEvent.timestamp}`;
    if (lastHandledLogEventKey.current === eventKey) return;
    lastHandledLogEventKey.current = eventKey;
    setLogsPage(1);
    void queryClient.invalidateQueries({ queryKey: queryKeys.accessLogs() });
  }, [lastEvent, tab, queryClient]);

  const statsLoading = summaryQuery.isLoading || weeklyQuery.isLoading;
  const statsError = errMsg(summaryQuery.error ?? weeklyQuery.error, 'Không tải được thống kê');
  const weeklyLoading = weeklyQuery.isLoading;
  const weeklyError = errMsg(weeklyQuery.error, 'Không tải được bảng tuần');
  const detailLoading = recordsQuery.isLoading;
  const detailError = exportError ?? errMsg(recordsQuery.error, 'Không tải được báo cáo');
  const logsLoading = logsQuery.isLoading;
  const logsError = errMsg(logsQuery.error, 'Không tải được log ra vào');

  function loadSummary() {
    void summaryQuery.refetch();
  }
  function loadWeekly() {
    void weeklyQuery.refetch();
  }
  function loadDetail() {
    void recordsQuery.refetch();
  }
  function loadLogs() {
    void logsQuery.refetch();
  }

  function applyWeekRange(start: string, dept = departmentId) {
    const end = weekEndFromStart(start);
    setFrom(start);
    setTo(end);
    setMatrixDeptId(dept);
    setApplied({ from: start, to: end, departmentId: dept });
  }

  function onFilter() {
    const errors = validateFilterDateRange(from, to);
    setDateErrors(errors);
    if (hasFormErrors(errors)) return;
    setRecordsPage(1);
    setLogsPage(1);
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

  useEffect(() => {
    setTimesheetPage(1);
  }, [
    debouncedTimesheetSearch,
    timesheetSort,
    timesheetLate,
    timesheetEarlyArrival,
    timesheetOt,
    applied.from,
    applied.to,
    applied.departmentId,
  ]);

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
  }, [weekly?.rows]);

  const weeklyFilteredCount = weekly?.rows?.length ?? 0;
  const weeklyTotalPages = weekly?.totalPages ?? 1;
  const weeklyCurrentPage = Math.min(weeklyPage, weeklyTotalPages);
  const pagedWeeklyGroups = weeklyGroups;

  useEffect(() => {
    setWeeklyPage(1);
  }, [debouncedWeeklySearch, weeklyStatus, weeklyLate, weeklyEarlyArrival, weeklyOt, weekStart]);

  const timesheetRows = summary?.timesheet ?? [];
  const timesheetTotalPages = summary?.timesheetTotalPages ?? 1;
  const timesheetCurrentPage = Math.min(timesheetPage, timesheetTotalPages);
  const pagedTimesheet = timesheetRows;

  useEffect(() => {
    setTimesheetPage(1);
  }, [timesheetSearch, timesheetLate, timesheetEarlyArrival, timesheetOt, timesheetSort, applied]);

  return (
    <PageShell
      badge="Báo cáo"
      title="Báo cáo chấm công"
      subtitle="Thống kê, bảng tổng hợp công, chi tiết nhân viên và log ra vào."
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full max-w-xl">
          <TabsTrigger value="stats">Thống kê</TabsTrigger>
          <TabsTrigger value="summary">Tổng hợp</TabsTrigger>
          <TabsTrigger value="detail">Chi tiết</TabsTrigger>
          <TabsTrigger value="logs">Log thô</TabsTrigger>
        </TabsList>

        {/* ── Filter card (shared) ── */}
        <DesignCard title="Tìm kiếm & bộ lọc" className="mt-4">
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <div>
              <label htmlFor="report-from" className="mb-1 block text-xs text-muted-foreground">
                Từ ngày
                <RequiredMark />
              </label>
              <Input
                id="report-from"
                type="date"
                className={cn('input-design h-10', dateErrors.from && 'border-destructive')}
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  const next = e.target.value;
                  setFrom(next);
                  setDateErrors((prev) => {
                    const n = { ...prev };
                    delete n.from;
                    if (to && next && to < next) delete n.to;
                    return n;
                  });
                  if (to && next && to < next) setTo('');
                }}
                aria-invalid={Boolean(dateErrors.from)}
              />
              <FieldError message={dateErrors.from} />
            </div>
            <div>
              <label htmlFor="report-to" className="mb-1 block text-xs text-muted-foreground">
                Đến ngày
                <RequiredMark />
              </label>
              <Input
                id="report-to"
                type="date"
                className={cn('input-design h-10', dateErrors.to && 'border-destructive')}
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  setDateErrors((prev) => {
                    const n = { ...prev };
                    delete n.to;
                    return n;
                  });
                }}
                aria-invalid={Boolean(dateErrors.to)}
              />
              <FieldError message={dateErrors.to} />
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
            title={`Chấm công theo tuần (${weeklyFilteredCount})`}
            description="Chi tiết chấm công từng ngày theo nhân viên, kèm ảnh snapshot lúc vào/ra và hệ số lương của ca."
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
            <div className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
              <div className="sm:col-span-2 xl:col-span-2">
                <label htmlFor="weekly-search" className="mb-1 block text-xs text-muted-foreground">
                  Tìm kiếm
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="weekly-search"
                    placeholder="Tên, mã NV, ca..."
                    className="input-design h-10 pl-10"
                    value={weeklySearch}
                    onChange={(e) => setWeeklySearch(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="weekly-status" className="mb-1 block text-xs text-muted-foreground">
                  Trạng thái
                </label>
                <Select
                  id="weekly-status"
                  className="h-10"
                  value={weeklyStatus}
                  onChange={(e) => setWeeklyStatus(e.target.value)}
                >
                  {ATTENDANCE_STATUS_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
                <FlagCheckbox
                  id="weekly-late"
                  label="Đi muộn"
                  value={weeklyLate}
                  onChange={setWeeklyLate}
                />
                <FlagCheckbox
                  id="weekly-early-arrival"
                  label="Đi sớm"
                  value={weeklyEarlyArrival}
                  onChange={setWeeklyEarlyArrival}
                />
                <FlagCheckbox id="weekly-ot" label="Tăng ca" value={weeklyOt} onChange={setWeeklyOt} />
              </div>
            </div>
            <QueryBoundary
              isLoading={weeklyLoading}
              error={weeklyError}
              isEmpty={weeklyFilteredCount === 0}
              onRetry={() => loadWeekly()}
              emptyTitle="Chưa có dữ liệu tuần này"
              emptyDescription="Chuyển sang tuần khác hoặc nới bộ lọc."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="p-2 font-semibold">Nhân viên</th>
                      <th className="p-2 font-semibold">Ngày</th>
                      <th className="p-2 font-semibold">Ca</th>
                      <th className="p-2 font-semibold">Khu vực</th>
                      <th className="p-2 font-semibold">Máy</th>
                      <th className="p-2 font-semibold">Giờ vào</th>
                      <th className="p-2 font-semibold">Giờ ra</th>
                      <th className="p-2 font-semibold">Ảnh</th>
                      <th className="p-2 text-right font-semibold">Giờ làm</th>
                      <th className="p-2 text-right font-semibold">Đi muộn</th>
                      <th className="p-2 text-right font-semibold">Đi sớm</th>
                      <th className="p-2 text-right font-semibold">OT</th>
                      <th className="p-2 text-right font-semibold">Hệ số</th>
                      <th className="p-2 font-semibold">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedWeeklyGroups.map((group) =>
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
                                <button
                                  type="button"
                                  className="text-left font-semibold text-primary underline-offset-2 hover:underline"
                                  title="Xem lịch sử chấm công & ra vào"
                                  onClick={() =>
                                    setHistoryPerson({
                                      userId: r.userId,
                                      fullName: group.fullName,
                                      employeeCode: group.employeeCode,
                                    })
                                  }
                                >
                                  {group.fullName}
                                </button>
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
                          <td className="p-2 text-xs text-muted-foreground">{r.zoneName || '—'}</td>
                          <td className="p-2 text-xs text-muted-foreground">{r.deviceName || '—'}</td>
                          <td className="p-2 font-mono text-xs">{formatTime(r.checkInAt)}</td>
                          <td className="p-2 font-mono text-xs">{formatTime(r.checkOutAt)}</td>
                          <td className="p-2">
                            <PunchSnapshotCell
                              checkInUrl={r.checkInSnapshotUrl}
                              checkOutUrl={r.checkOutSnapshotUrl}
                              name={group.fullName}
                            />
                          </td>
                          <td className="p-2 text-right font-medium">
                            {r.workedMinutes > 0 ? formatMinutes(r.workedMinutes) : '—'}
                            {!r.checkOutAt && r.checkInAt && (
                              <span className="ml-1 text-[10px] text-sky-600">(tạm)</span>
                            )}
                          </td>
                          <td className={cn('p-2 text-right', r.lateMinutes > 0 && 'text-orange-600')}>
                            {r.lateMinutes > 0 ? formatMinutes(r.lateMinutes) : '—'}
                          </td>
                          <td
                            className={cn(
                              'p-2 text-right',
                              (r.earlyArrivalMinutes ?? 0) > 0 && 'text-sky-600',
                            )}
                          >
                            {(r.earlyArrivalMinutes ?? 0) > 0
                              ? formatMinutes(r.earlyArrivalMinutes)
                              : '—'}
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
                            <StatusBadge status={r.lateMinutes > 0 ? 'LATE' : r.status} />
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
              <TablePager
                currentPage={weeklyCurrentPage}
                totalPages={weeklyTotalPages}
                total={weekly?.totalUsers ?? weeklyGroups.length}
                unit="nhân viên"
                onPageChange={setWeeklyPage}
              />
            </QueryBoundary>
          </DesignCard>
        </TabsContent>

        {/* ═══ TAB: TỔNG HỢP ═══ */}
        <TabsContent value="summary" className="space-y-6">
          <DesignCard
            title={`Bảng tổng hợp công (${summary?.timesheetTotal ?? timesheetRows.length})`}
            description="Tổng hợp công theo từng nhân viên trong khoảng thời gian đã chọn. Giờ làm cập nhật liên tục kể cả khi chưa check-out."
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
            <div className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="sm:col-span-2 xl:col-span-2">
                <label htmlFor="timesheet-search" className="mb-1 block text-xs text-muted-foreground">
                  Tìm kiếm
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="timesheet-search"
                    placeholder="Tên, mã NV, phòng ban..."
                    className="input-design h-10 pl-10"
                    value={timesheetSearch}
                    onChange={(e) => setTimesheetSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
                <FlagCheckbox
                  id="timesheet-late"
                  label="Đi muộn"
                  value={timesheetLate}
                  onChange={setTimesheetLate}
                />
                <FlagCheckbox
                  id="timesheet-early-arrival"
                  label="Đi sớm"
                  value={timesheetEarlyArrival}
                  onChange={setTimesheetEarlyArrival}
                />
                <FlagCheckbox
                  id="timesheet-ot"
                  label="Tăng ca"
                  value={timesheetOt}
                  onChange={setTimesheetOt}
                />
              </div>
            </div>
            <QueryBoundary
              isLoading={statsLoading}
              error={statsError}
              isEmpty={timesheetRows.length === 0}
              onRetry={() => loadSummary()}
              emptyTitle="Chưa có dữ liệu"
              emptyDescription="Chọn khoảng thời gian khác hoặc nới bộ lọc bảng tổng hợp."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="p-2 font-semibold">Nhân viên</th>
                      <th className="p-2 font-semibold">Phòng ban</th>
                      <th className="p-2 text-right font-semibold">Ngày công</th>
                      <th className="p-2 text-right font-semibold">Giờ làm</th>
                      <th className="p-2 text-right font-semibold">Đi muộn</th>
                      <th className="p-2 text-right font-semibold">Đi sớm</th>
                      <th className="p-2 text-right font-semibold">OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTimesheet.map((t) => (
                      <tr key={t.userId} className="border-t border-border hover:bg-muted/20">
                        <td className="p-2">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={t.fullName} />
                            <div>
                              <button
                                type="button"
                                className="text-left font-semibold text-primary underline-offset-2 hover:underline"
                                title="Xem lịch sử chấm công & ra vào"
                                onClick={() =>
                                  setHistoryPerson({
                                    userId: t.userId,
                                    fullName: t.fullName,
                                    employeeCode: t.employeeCode,
                                  })
                                }
                              >
                                {t.fullName}
                              </button>
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
                        <td
                          className={cn(
                            'p-2 text-right',
                            (t.earlyArrivalCount ?? 0) > 0 && 'text-sky-600',
                          )}
                        >
                          {t.earlyArrivalCount ?? 0}
                        </td>
                        <td className={cn('p-2 text-right', t.otMinutes > 0 && 'text-emerald-600')}>
                          {formatMinutes(t.otMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePager
                currentPage={timesheetCurrentPage}
                totalPages={timesheetTotalPages}
                total={summary?.timesheetTotal ?? timesheetRows.length}
                unit="nhân viên"
                onPageChange={setTimesheetPage}
              />
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
            <div className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="sm:col-span-2">
                <label htmlFor="records-search" className="mb-1 block text-xs text-muted-foreground">
                  Tìm kiếm
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="records-search"
                    placeholder="Tên hoặc mã nhân viên..."
                    className="input-design h-10 pl-10"
                    value={recordsSearch}
                    onChange={(e) => {
                      setRecordsSearch(e.target.value);
                      setRecordsPage(1);
                    }}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="records-status" className="mb-1 block text-xs text-muted-foreground">
                  Trạng thái
                </label>
                <Select
                  id="records-status"
                  className="h-10"
                  value={recordsStatus}
                  onChange={(e) => {
                    setRecordsStatus(e.target.value);
                    setRecordsPage(1);
                  }}
                >
                  {ATTENDANCE_STATUS_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
                <FlagCheckbox
                  id="records-late"
                  label="Đi muộn"
                  value={recordsLate}
                  onChange={(v) => {
                    setRecordsLate(v);
                    setRecordsPage(1);
                  }}
                />
                <FlagCheckbox
                  id="records-ot"
                  label="Tăng ca"
                  value={recordsOt}
                  onChange={(v) => {
                    setRecordsOt(v);
                    setRecordsPage(1);
                  }}
                />
              </div>
            </div>
            <QueryBoundary
              isLoading={detailLoading}
              error={detailError}
              isEmpty={records.length === 0}
              onRetry={() => loadDetail()}
              emptyTitle="Chưa có bản ghi"
              emptyDescription="Chọn khoảng thời gian khác hoặc nới bộ lọc."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="p-2 font-semibold">Ngày</th>
                      <th className="p-2 font-semibold">Nhân viên</th>
                      <th className="p-2 font-semibold">Phòng ban</th>
                      <th className="p-2 font-semibold">Ca</th>
                      <th className="p-2 font-semibold">Khu vực</th>
                      <th className="p-2 font-semibold">Máy</th>
                      <th className="p-2 font-semibold">Chấm vào</th>
                      <th className="p-2 font-semibold">Chấm ra</th>
                      <th className="p-2 font-semibold">Trạng thái</th>
                      <th className="p-2 text-right font-semibold">Muộn</th>
                      <th className="p-2 text-right font-semibold">OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                        <td className="p-2 font-mono text-xs text-muted-foreground">
                          {String(r.date).slice(0, 10)}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-left font-semibold text-primary underline-offset-2 hover:underline"
                            title="Xem lịch sử chấm công & ra vào"
                            onClick={() =>
                              setHistoryPerson({
                                userId: r.userId,
                                fullName: r.user?.fullName || r.userId,
                                employeeCode: r.user?.employeeCode,
                              })
                            }
                          >
                            {r.user?.fullName || r.userId}
                          </button>
                          {r.user?.employeeCode && (
                            <span className="ml-1 font-mono text-xs text-muted-foreground">
                              ({r.user.employeeCode})
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {r.user?.department?.name ?? '—'}
                        </td>
                        <td className="p-2">{r.workShift?.name || '—'}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {r.punchLocation?.zoneName || '—'}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {r.punchLocation?.deviceName || '—'}
                        </td>
                        <td className="p-2 font-mono text-xs">{formatDt(r.checkInAt)}</td>
                        <td className="p-2 font-mono text-xs">{formatDt(r.checkOutAt)}</td>
                        <td className="p-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td
                          className={cn(
                            'p-2 text-right text-xs',
                            (r.lateMinutes ?? 0) > 0 ? 'text-orange-600' : 'text-muted-foreground',
                          )}
                        >
                          {r.lateMinutes ?? 0}p
                        </td>
                        <td
                          className={cn(
                            'p-2 text-right text-xs',
                            (r.otMinutes ?? 0) > 0 ? 'text-emerald-600' : 'text-muted-foreground',
                          )}
                        >
                          {r.otMinutes ?? 0}p
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <TablePager
                className="mt-4 pt-4"
                currentPage={recordsCurrentPage}
                totalPages={recordsTotalPages}
                total={recordsTotal}
                unit="bản ghi"
                onPageChange={setRecordsPage}
              />
            </QueryBoundary>
          </DesignCard>

          <EmployeeWeekMatrix
            rangeFrom={matrixRange.from}
            rangeTo={matrixRange.to}
            departments={departments}
            departmentId={matrixDeptId}
            onDepartmentChange={setMatrixDeptId}
          />
        </TabsContent>

        {/* ═══ TAB: LOG RA VÀO ═══ */}
        <TabsContent value="logs" className="space-y-6">
          <DesignCard
            title="Log thô (chấm công + ra vào)"
            description="Chấm vào/ra = lần tính công. Lượt vào/ra = quét sau khi đã chấm xong ngày (chỉ lưu log). Bấm tên NV để xem cả hai lịch sử."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <ReportsLogsConfigPanel />
                <Button variant="outline" size="sm" onClick={loadLogs} disabled={logsLoading}>
                  <RefreshCw className={logsLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  Làm mới
                </Button>
              </div>
            }
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative max-w-md flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo tên hoặc mã NV..."
                  className="input-design h-10 pl-10"
                  value={logsSearch}
                  onChange={(e) => {
                    setLogsSearch(e.target.value);
                    setLogsPage(1);
                  }}
                />
              </div>
              <Select
                value={logsKind}
                onChange={(e) => {
                  setLogsKind(e.target.value as '' | 'attendance' | 'movement');
                  setLogsPage(1);
                }}
                className="h-10 w-full sm:w-44"
              >
                <option value="">Tất cả loại</option>
                <option value="attendance">Chỉ chấm công</option>
                <option value="movement">Chỉ lượt ra vào</option>
              </Select>
              <Select
                value={logsAction}
                onChange={(e) => {
                  setLogsAction(e.target.value);
                  setLogsPage(1);
                }}
                className="h-10 w-full sm:w-40"
              >
                <option value="">Mọi hướng</option>
                <option value="CHECK_IN">Vào</option>
                <option value="CHECK_OUT">Ra</option>
                <option value="UNKNOWN">Người lạ</option>
              </Select>
              <Select
                value={logsValidity}
                onChange={(e) => {
                  setLogsValidity(e.target.value);
                  setLogsPage(1);
                }}
                className="h-10 w-full sm:w-36"
              >
                <option value="">Tất cả</option>
                <option value="true">Hợp lệ</option>
                <option value="false">Cảnh báo</option>
              </Select>
            </div>

            <QueryBoundary
              isLoading={logsLoading}
              error={logsError}
              isEmpty={accessLogs.length === 0}
              onRetry={loadLogs}
              emptyTitle="Không có log ra vào"
              emptyDescription="Thử đổi khoảng ngày hoặc bộ lọc."
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="p-2 font-semibold">Thời gian</th>
                      <th className="p-2 font-semibold">Nhân viên</th>
                      <th className="p-2 font-semibold">Mã NV</th>
                      <th className="p-2 font-semibold">Phòng ban</th>
                      <th className="p-2 font-semibold">Hành động</th>
                      <th className="p-2 font-semibold">Khu vực</th>
                      <th className="p-2 font-semibold">Thiết bị</th>
                      <th className="p-2 font-semibold">Trạng thái</th>
                      <th className="p-2 text-right font-semibold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLogs.map((log) => (
                      <tr
                        key={log.id}
                        className={cn(
                          'border-t border-border hover:bg-muted/20',
                          log.isValid === false && 'bg-destructive/5',
                        )}
                      >
                        <td className="p-2 font-mono text-xs text-muted-foreground">
                          {formatDt(log.eventAt)}
                        </td>
                        <td className="p-2 font-semibold">
                          {log.user?.fullName || log.userId ? (
                            <button
                              type="button"
                              className="text-left font-semibold text-primary underline-offset-2 hover:underline"
                              title="Xem lịch sử chấm công & ra vào"
                              onClick={() => {
                                const userId = log.userId || log.user?.id;
                                if (!userId) return;
                                setHistoryPerson({
                                  userId,
                                  fullName: log.user?.fullName ?? 'Nhân viên',
                                  employeeCode: log.user?.employeeCode,
                                });
                              }}
                            >
                              {log.user?.fullName ?? 'Không xác định'}
                            </button>
                          ) : (
                            'Không xác định'
                          )}
                        </td>
                        <td className="p-2 font-mono text-xs text-muted-foreground">
                          {log.user?.employeeCode || '—'}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {log.user?.department?.name ?? '—'}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs font-normal">
                            {accessLogActionLabel(log.action, {
                              hasUser: Boolean(log.user || log.userId),
                              warningMessage: log.warningMessage,
                            })}
                          </Badge>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {log.zone?.name || '—'}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {log.device?.name || '—'}
                        </td>
                        <td className="p-2">
                          {(() => {
                            const kind = accessLogKindLabel({
                              action: log.action,
                              isValid: log.isValid,
                              warningMessage: log.warningMessage,
                              hasUser: Boolean(log.user || log.userId),
                            });
                            return (
                              <Badge
                                className={cn(
                                  'border-transparent text-xs',
                                  kind.kind === 'movement' && 'bg-sky-100 text-sky-800',
                                  kind.kind === 'attendance' && 'bg-emerald-100 text-emerald-700',
                                  kind.kind === 'warning' && 'bg-destructive/15 text-destructive',
                                  kind.kind === 'stranger' && 'bg-amber-100 text-amber-800',
                                  kind.kind === 'other' && 'bg-muted text-muted-foreground',
                                )}
                              >
                                {kind.label}
                              </Badge>
                            );
                          })()}
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => setSelectedAccessLog(log)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Chi tiết
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <TablePager
                className="mt-4 pt-4"
                currentPage={logsCurrentPage}
                totalPages={logsTotalPages}
                total={logsTotal}
                unit="log"
                onPageChange={setLogsPage}
              />
            </QueryBoundary>
          </DesignCard>
        </TabsContent>
      </Tabs>

      <AccessLogDetailDialog
        open={!!selectedAccessLog}
        log={selectedAccessLog}
        onClose={() => setSelectedAccessLog(null)}
      />
      <PersonHistoryDialog
        open={!!historyPerson}
        person={historyPerson}
        from={applied.from || undefined}
        to={applied.to || undefined}
        onClose={() => setHistoryPerson(null)}
      />
    </PageShell>
  );
}

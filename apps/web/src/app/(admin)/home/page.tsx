'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Building2,
  Camera,
  ChevronRight,
  Clock,
  Cpu,
  HardHat,
  LogIn,
  LogOut,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DesignCard } from '@/components/design/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QueryBoundary } from '@/components/ui/query-states';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/queryKeys';
import { getAccessLogs, getHomeDashboard, type AccessLog, type HomeDashboard } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) => {
    const [y, m, day] = iso.split('-');
    return `${day}/${m}/${y}`;
  };
  return `${fmt(from)} – ${fmt(to)}`;
}

const PIE_COLORS = [
  'hsl(var(--primary))',
  '#0284c7',
  '#059669',
  '#ea580c',
  '#7c3aed',
  '#db2777',
  '#0d9488',
  '#ca8a04',
];

function formatDayLabel(iso: string): string {
  const parts = iso.split('-');
  return `${parts[2]}/${parts[1]}`;
}

function ClockCard() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-w-[220px] items-center gap-4 rounded-sm bg-primary p-4 text-white shadow-sm">
      <div className="rounded-sm bg-white/20 p-2.5">
        <Clock className="h-5 w-5" />
      </div>
      <div>
        <p className="font-mono font-heading text-xl font-bold">
          {now ? now.toLocaleTimeString('vi-VN') : '--:--:--'}
        </p>
        <p className="text-xs text-white/80">
          {now
            ? now.toLocaleDateString('vi-VN', {
                weekday: 'long',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })
            : ''}
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  tone?: 'alert' | 'default';
}) {
  return (
    <div
      className={cn(
        'rounded-sm border bg-surface p-5',
        tone === 'alert' && value > 0 ? 'border-orange-300 bg-orange-50/50' : 'border-border',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-label-caps uppercase tracking-wider text-muted-foreground">{label}</p>
        <div
          className={cn(
            'rounded-sm p-2',
            tone === 'alert' && value > 0
              ? 'bg-orange-100 text-orange-700'
              : 'bg-secondary/20 text-foreground',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p
        className={cn(
          'font-heading text-3xl font-bold',
          tone === 'alert' && value > 0 ? 'text-orange-700' : 'text-foreground',
        )}
      >
        {value.toLocaleString('vi-VN')}
      </p>
    </div>
  );
}

function RecentLogsTable({ logs }: { logs: AccessLog[] }) {
  if (logs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có hoạt động</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 pr-2 font-semibold">Nhân viên</th>
            <th className="pb-2 pr-2 font-semibold">Thiết bị / khu</th>
            <th className="pb-2 pr-2 font-semibold">Giờ</th>
            <th className="pb-2 font-semibold">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-2">
                <p className="truncate font-medium text-foreground">
                  {log.user?.fullName ?? 'Không xác định'}
                </p>
              </td>
              <td className="py-2 pr-2">
                <p className="truncate text-foreground">{log.device.name}</p>
                <p className="truncate text-xs text-muted-foreground">{log.zone?.name ?? '—'}</p>
              </td>
              <td className="whitespace-nowrap py-2 pr-2 text-muted-foreground">
                {new Date(log.eventAt).toLocaleTimeString('vi-VN')}
              </td>
              <td className="py-2">
                <span
                  className={cn(
                    'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
                    log.isValid === false
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-emerald-100 text-emerald-800',
                  )}
                >
                  {log.isValid === false ? 'Cảnh báo' : 'Hợp lệ'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemResourcesCard({
  overview,
}: {
  overview: HomeDashboard['overview'];
}) {
  const items: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: 'Nhân sự', value: overview.users, icon: Users },
    { label: 'Thiết bị', value: overview.devices, icon: Cpu },
    { label: 'Camera', value: overview.cameras, icon: Camera },
    { label: 'Dự án', value: overview.projects, icon: Building2 },
    { label: 'Nhà thầu', value: overview.contractors, icon: HardHat },
  ];

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center justify-between rounded-sm border border-border px-3 py-2.5"
        >
          <div className="flex items-center gap-2.5">
            <div className="rounded-sm bg-secondary/20 p-1.5">
              <item.icon className="h-4 w-4 text-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">{item.label}</span>
          </div>
          <span className="font-heading text-lg font-bold text-foreground">
            {item.value.toLocaleString('vi-VN')}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const { canAccess } = usePermissions();
  const [from, setFrom] = useState(() => daysAgoIso(6));
  const [to, setTo] = useState(todayIso);
  const [appliedFrom, setAppliedFrom] = useState(() => daysAgoIso(6));
  const [appliedTo, setAppliedTo] = useState(todayIso);
  const [deniedNotice, setDeniedNotice] = useState(false);

  const filtersValid = Boolean(from && to && from <= to);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('denied') === '1') {
      setDeniedNotice(true);
      window.history.replaceState({}, '', '/home');
    }
  }, []);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.homeDashboard({ from: appliedFrom, to: appliedTo }),
    queryFn: () => getHomeDashboard({ from: appliedFrom, to: appliedTo }),
    enabled: Boolean(appliedFrom && appliedTo && appliedFrom <= appliedTo),
  });

  const logsQuery = useQuery({
    queryKey: ['accessLogs', 'home-recent', appliedFrom, appliedTo],
    queryFn: () => getAccessLogs({ limit: 8, from: appliedFrom, to: appliedTo }),
    enabled: Boolean(appliedFrom && appliedTo && appliedFrom <= appliedTo),
  });

  const data = dashboardQuery.data;
  const overview = data?.overview;
  const zones = data?.zones ?? [];
  const logs = logsQuery.data ?? [];

  const presentTotal = useMemo(
    () => zones.reduce((sum, z) => sum + z.presentCount, 0),
    [zones],
  );

  const trafficChart = useMemo(
    () =>
      (data?.traffic7d ?? []).map((d) => ({
        ...d,
        label: formatDayLabel(d.date),
      })),
    [data?.traffic7d],
  );

  const contractorPie = useMemo(() => {
    const rows = overview?.staffByContractor ?? [];
    const total = rows.reduce((n, r) => n + r.count, 0) || 1;
    return rows.map((r, idx) => ({
      name: r.name,
      value: r.count,
      percent: Math.round((r.count / total) * 100),
      color: PIE_COLORS[idx % PIE_COLORS.length]!,
    }));
  }, [overview?.staffByContractor]);

  const checkIns = data?.periodSummary.checkIns ?? 0;
  const checkOuts = data?.periodSummary.checkOuts ?? 0;
  const invalidEvents = data?.periodSummary.invalidEvents ?? 0;
  const rangeLabel = data ? formatRangeLabel(data.from, data.to) : formatRangeLabel(appliedFrom, appliedTo);

  const applyFilter = () => {
    if (!filtersValid) return;
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const refresh = () => {
    void dashboardQuery.refetch();
    void logsQuery.refetch();
  };

  const dashboardError =
    dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : dashboardQuery.error
        ? 'Không tải được dữ liệu tổng quan.'
        : null;

  function DashboardBody({ dashboard }: { dashboard: HomeDashboard }) {
    return (
      <>
        {(dashboard.overview.unassignedEmployees ?? 0) > 0 && canAccess('/shifts') && (
          <Link
            href="/shifts"
            className="flex flex-col gap-2 rounded-sm border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 transition-colors hover:bg-amber-100 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p>
                Có{' '}
                <strong>{dashboard.overview.unassignedEmployees.toLocaleString('vi-VN')}</strong>{' '}
                nhân viên chưa gán ca — quét cửa sẽ không được tính chấm công.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
              Vào phân ca
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="NV đang trong khu" value={presentTotal} icon={Users} />
          <KpiCard label="Check-in" value={checkIns} icon={LogIn} />
          <KpiCard label="Check-out" value={checkOuts} icon={LogOut} />
          <KpiCard
            label="Cảnh báo"
            value={invalidEvents}
            icon={AlertTriangle}
            tone="alert"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <DesignCard
            className="lg:col-span-2"
            title="Xu hướng ra vào"
            description={`Lượt check-in và check-out theo ngày (${rangeLabel}).`}
          >
            {trafficChart.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trafficChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="checkIns"
                      name="Check-in"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="checkOuts"
                      name="Check-out"
                      stroke="#ea580c"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </DesignCard>

          <DesignCard
            className="lg:col-span-1"
            title="Nhân sự theo nhà thầu"
            description="Cơ cấu nhân sự đang gắn nhà thầu."
          >
            {contractorPie.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Chưa có nhân sự gắn nhà thầu
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="mx-auto h-[200px] w-full max-w-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={contractorPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        innerRadius={48}
                        paddingAngle={2}
                      >
                        {contractorPie.map((row) => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, item) => [
                          `${value} NV (${item?.payload?.percent ?? 0}%)`,
                          String(item?.payload?.name ?? ''),
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="max-h-[120px] space-y-1 overflow-y-auto pr-1">
                  {contractorPie.map((row) => (
                    <li key={row.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: row.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-foreground" title={row.name}>
                        {row.name}
                      </span>
                      <span className="shrink-0 font-mono text-muted-foreground">{row.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DesignCard>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <DesignCard
            className="lg:col-span-2"
            title="Chấm công gần nhất"
            actions={
              canAccess('/reports') ? (
                <Link
                  href="/reports"
                  className="inline-flex items-center gap-0.5 text-xs font-semibold text-foreground hover:underline"
                >
                  Xem chấm công
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : undefined
            }
          >
            <RecentLogsTable logs={logs} />
          </DesignCard>

          <DesignCard
            className="lg:col-span-1"
            title="Tài nguyên hệ thống"
            description="Tổng quan dữ liệu nền tảng."
          >
            <SystemResourcesCard overview={dashboard.overview} />
          </DesignCard>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral font-body text-foreground">
      <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <span className="text-label-caps uppercase tracking-[0.2em] text-foreground">
                Access Control
              </span>
              <h1 className="mt-1 font-heading text-3xl font-bold text-foreground md:text-4xl">
                Trang tổng quan
              </h1>
              <p className="mt-1 text-sm text-foreground/60">
                KPI vận hành, xu hướng ra vào và giao dịch gần nhất
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
                <Input
                  type="date"
                  className="input-design h-9 min-w-[11.25rem]"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFrom(next);
                    if (to && next && to < next) setTo(next);
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Đến ngày</label>
                <Input
                  type="date"
                  className="input-design h-9 min-w-[11.25rem]"
                  value={to}
                  min={from || undefined}
                  max={todayIso()}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="h-9"
                onClick={applyFilter}
                disabled={!filtersValid || dashboardQuery.isFetching}
              >
                Lọc
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={refresh}
                disabled={dashboardQuery.isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', dashboardQuery.isFetching && 'animate-spin')} />
                Làm mới
              </Button>
              <ClockCard />
            </div>
          </div>

          {!filtersValid && (
            <p className="text-sm text-destructive">Khoảng ngày không hợp lệ.</p>
          )}

          {deniedNotice && (
            <div className="rounded-sm border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Bạn không có quyền truy cập trang vừa chọn.
            </div>
          )}

          <QueryBoundary
            isLoading={dashboardQuery.isLoading}
            error={dashboardError}
            loadingLabel="Đang tải dashboard..."
            onRetry={refresh}
          >
            {data && <DashboardBody dashboard={data} />}
          </QueryBoundary>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import {
  AlertTriangle,
  Clock3,
  LogIn,
  LogOut,
  TrendingUp,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { QueryBoundary } from '@/components/ui/query-states';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  getAnalyticsStats,
  getContractors,
  getProjects,
  getUsers,
  type Project,
} from '@/lib/api';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatMinutes(m: number): string {
  if (!m) return '0p';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h <= 0) return `${min}p`;
  return min ? `${h}h ${min}p` : `${h}h`;
}

function formatDayLabel(iso: string): string {
  const parts = iso.split('-');
  return `${parts[2]}/${parts[1]}`;
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
  '#4f46e5',
  '#dc2626',
  '#64748b',
  '#16a34a',
];

export default function AnalyticsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [contractorId, setContractorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [userId, setUserId] = useState('');

  const contractorsQuery = useQuery({
    queryKey: ['contractors', 'analytics'],
    queryFn: () => getContractors(),
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', 'analytics-list', contractorId],
    queryFn: async (): Promise<Project[]> => {
      if (contractorId) {
        const page = await getProjects({ contractorId, page: 1, pageSize: 200 });
        return page.items;
      }
      return getProjects();
    },
  });

  const usersQuery = useQuery({
    queryKey: ['users', 'analytics', contractorId, projectId],
    queryFn: () =>
      getUsers({
        page: 1,
        pageSize: 100,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
      }),
  });

  const filtersValid = Boolean(from && to && from <= to);

  const analyticsQuery = useQuery({
    queryKey: queryKeys.analyticsStats({
      from,
      to,
      contractorId,
      projectId,
      userId,
    }),
    queryFn: () =>
      getAnalyticsStats({
        from,
        to,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
        userId: userId || undefined,
      }),
    enabled: filtersValid,
  });

  const contractors = contractorsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const users = usersQuery.data?.items ?? [];
  const data = analyticsQuery.data;

  useEffect(() => {
    setProjectId('');
    setUserId('');
  }, [contractorId]);

  useEffect(() => {
    setUserId('');
  }, [projectId]);

  useEffect(() => {
    if (!userId) return;
    if (!users.some((u) => u.id === userId)) setUserId('');
  }, [users, userId]);

  const byDayChart = useMemo(
    () =>
      (data?.byDay ?? []).map((d) => ({
        ...d,
        label: formatDayLabel(d.date),
      })),
    [data?.byDay],
  );

  const breakdownChart = useMemo(() => {
    const rows = (data?.breakdown ?? []).slice(0, 12);
    const total = rows.reduce((n, b) => n + b.value, 0) || 1;
    return rows.map((b, idx) => ({
      name: b.label,
      value: b.value,
      late: b.lateCount,
      ot: b.otMinutes,
      percent: Math.round((b.value / total) * 100),
      color: PIE_COLORS[idx % PIE_COLORS.length]!,
    }));
  }, [data?.breakdown]);

  const breakdownUnitLabel =
    data?.breakMode === 'contractor'
      ? 'nhà thầu'
      : data?.breakMode === 'project'
        ? 'dự án'
        : data?.breakMode === 'user'
          ? 'nhân sự'
          : '';


  const breakdownTitle =
    data?.breakMode === 'contractor'
      ? 'Phân bổ theo nhà thầu (ngày công)'
      : data?.breakMode === 'project'
        ? 'Phân bổ theo dự án (ngày công)'
        : data?.breakMode === 'user'
          ? 'Phân bổ theo nhân sự (ngày công)'
          : null;

  const kpis = [
    {
      label: 'Nhân sự',
      value: data?.summary.staffCount ?? '—',
      icon: Users,
      tone: 'text-foreground',
    },
    {
      label: 'Ngày công',
      value: data?.summary.presentDays ?? '—',
      icon: CheckCircle2,
      tone: 'text-emerald-600',
    },
    {
      label: 'Đi muộn',
      value: data?.summary.lateCount ?? '—',
      icon: AlertTriangle,
      tone: 'text-orange-600',
    },
    {
      label: 'OT',
      value: data ? formatMinutes(data.summary.otMinutes) : '—',
      icon: Clock3,
      tone: 'text-sky-600',
    },
    {
      label: 'Giờ làm',
      value: data ? formatMinutes(data.summary.workedMinutes) : '—',
      icon: TrendingUp,
      tone: 'text-primary',
    },
    {
      label: 'Check-in',
      value: data?.summary.checkInCount ?? '—',
      icon: LogIn,
      tone: 'text-foreground',
    },
    {
      label: 'Check-out',
      value: data?.summary.checkOutCount ?? '—',
      icon: LogOut,
      tone: 'text-muted-foreground',
    },
  ];

  const error =
    analyticsQuery.error instanceof ApiError
      ? analyticsQuery.error.message
      : analyticsQuery.error
        ? 'Không tải được thống kê'
        : null;

  return (
    <PageShell
      badge="Thống kê"
      title="Thống kê"
      subtitle="Lọc theo dự án, nhà thầu hoặc nhân sự — biểu đồ cập nhật ngay khi đổi bộ lọc."
    >
      <DesignCard title="Bộ lọc">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
            <Input
              type="date"
              className="input-design h-10"
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
              className="input-design h-10"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nhà thầu</label>
            <Select
              className="h-10"
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
            >
              <option value="">Tất cả nhà thầu</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Dự án{contractorId ? ' (của nhà thầu)' : ''}
            </label>
            <Select
              className="h-10"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Tất cả dự án</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Nhân sự
              {contractorId || projectId ? ' (theo bộ lọc)' : ''}
            </label>
            <Select className="h-10" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Tất cả nhân sự</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.employeeCode || '—'})
                </option>
              ))}
            </Select>
          </div>
        </div>
        {!filtersValid && (
          <p className="mt-3 text-xs text-destructive">Khoảng ngày không hợp lệ.</p>
        )}
      </DesignCard>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
        {kpis.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-sm border border-border bg-surface p-3"
          >
            <div className="rounded-sm bg-secondary/20 p-2">
              <s.icon className={cn('h-4 w-4', s.tone)} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className={cn('truncate font-heading text-base font-bold', s.tone)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <QueryBoundary
        isLoading={analyticsQuery.isLoading}
        error={error}
        onRetry={() => void analyticsQuery.refetch()}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DesignCard
            title="Theo ngày"
            description="Ngày công, đi muộn, check-in / check-out trong khoảng đã chọn."
          >
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byDayChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="present"
                    name="Ngày công"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="late"
                    name="Muộn"
                    stroke="#ea580c"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="checkIns"
                    name="Check-in"
                    stroke="#0284c7"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="checkOuts"
                    name="Check-out"
                    stroke="#64748b"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </DesignCard>

          {breakdownTitle ? (
            <DesignCard title={breakdownTitle} description="Tỷ lệ ngày công trong phạm vi lọc.">
              {breakdownChart.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>
              ) : (
                <div className="flex min-h-[280px] flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="mx-auto h-[240px] w-full max-w-[260px] shrink-0 sm:mx-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={breakdownChart}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          innerRadius={52}
                          paddingAngle={2}
                        >
                          {breakdownChart.map((row) => (
                            <Cell key={row.name} fill={row.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, _name, item) => [
                            `${value} ngày công (${item?.payload?.percent ?? 0}%)`,
                            String(item?.payload?.name ?? ''),
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-1.5 overflow-y-auto pr-1 sm:max-h-[280px]">
                    {breakdownChart.map((row) => (
                      <li
                        key={row.name}
                        className="flex items-center gap-2.5 rounded-sm px-1 py-1 text-sm hover:bg-muted/40"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-sm"
                          style={{ backgroundColor: row.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-foreground" title={row.name}>
                          {row.name}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {row.value} · {row.percent}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {breakdownUnitLabel ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Mỗi màu tương ứng một {breakdownUnitLabel} trong danh sách bên phải.
                </p>
              ) : null}
            </DesignCard>
          ) : (
            <DesignCard
              title="Phân bổ"
              description="Đang xem một nhân sự — chỉ hiển thị chuỗi theo ngày."
            >
              <p className="py-16 text-center text-sm text-muted-foreground">
                Bỏ chọn nhân sự để xem phân bổ theo nhà thầu / dự án / danh sách NV.
              </p>
            </DesignCard>
          )}
        </div>
      </QueryBoundary>
    </PageShell>
  );
}

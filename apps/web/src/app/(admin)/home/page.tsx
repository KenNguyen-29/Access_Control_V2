'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Monitor,
  Activity,
  Users,
  Clock,
  LayoutGrid,
  ShieldCheck,
  UserCheck,
  CalendarClock,
  Cpu,
  ChevronRight,
  Siren,
  Shield,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getAccessLogs,
  getStatsOverview,
  type AccessLog,
  type StatsOverview,
} from '@/lib/api';

type NavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  description: string;
};

function NavButton({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.path}
      className="group flex aspect-square flex-col items-center justify-center rounded-sm border border-border bg-surface p-4 text-center transition-colors hover:border-primary/40"
    >
      <div className="mb-3 rounded-sm bg-secondary/20 p-3 text-foreground transition-colors group-hover:bg-secondary/30">
        <item.icon className="h-6 w-6" />
      </div>
      <span className="text-label-caps uppercase leading-tight tracking-wider text-foreground">
        {item.label}
      </span>
      <span className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
        {item.description}
      </span>
    </Link>
  );
}

const operations: NavItem[] = [
  { icon: Monitor, label: 'Giám sát', path: '/dashboard', description: 'Camera live & FaceID realtime' },
  { icon: Activity, label: 'Báo cáo', path: '/reports', description: 'Chấm công & access logs' },
  { icon: Siren, label: 'Sơ tán', path: '/muster', description: 'Điểm danh khẩn cấp FACP' },
];

const configs: NavItem[] = [
  { icon: Users, label: 'Nhân sự', path: '/users', description: 'Quản lý nhân viên' },
  { icon: Clock, label: 'Ca làm', path: '/shifts', description: 'Cấu hình & gán ca' },
  { icon: LayoutGrid, label: 'Thiết bị', path: '/devices', description: 'Akuvox & Camera' },
  { icon: Shield, label: 'Kiểm soát ra vào', path: '/access-control', description: 'Phân quyền khu vực' },
  { icon: Settings, label: 'Cài đặt', path: '/settings', description: 'Hệ thống & cấu hình' },
];

type StatItem = { icon: LucideIcon; label: string; value: number; hint?: string };

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <h2 className="whitespace-nowrap text-label-caps font-semibold uppercase tracking-[0.2em] text-foreground">
        {label}
      </h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
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
          {now ? now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [logs, setLogs] = useState<AccessLog[]>([]);

  useEffect(() => {
    getStatsOverview().then(setStats).catch(() => {});
    getAccessLogs(8).then(setLogs).catch(() => {});
  }, []);

  const statItems: StatItem[] = [
    { icon: Users, label: 'Nhân sự', value: stats?.users ?? 0 },
    { icon: Cpu, label: 'Thiết bị', value: stats?.devices ?? 0, hint: `${stats?.cameras ?? 0} camera` },
    { icon: CalendarClock, label: 'Ca làm việc', value: stats?.workShifts ?? 0 },
    { icon: UserCheck, label: 'Chấm công hôm nay', value: stats?.todayAttendance ?? 0, hint: `${stats?.todayLate ?? 0} đi muộn` },
    { icon: ShieldCheck, label: 'Sự kiện hôm nay', value: stats?.todayEvents ?? 0, hint: `${stats?.todayInvalidEvents ?? 0} cảnh báo` },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral font-body text-foreground">
      <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          {/* Header */}
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <span className="text-label-caps uppercase tracking-[0.2em] text-foreground">
                Access Control
              </span>
              <h1 className="mt-1 font-heading text-3xl font-bold text-foreground md:text-4xl">
                Trang chủ
              </h1>
              <p className="mt-1 text-sm text-foreground/60">
                Tổng quan hệ thống kiểm soát ra vào & chấm công
              </p>
            </div>
            <ClockCard />
          </div>

          {(stats?.unassignedEmployees ?? 0) > 0 && (
            <Link
              href="/shifts"
              className="flex flex-col gap-2 rounded-sm border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 transition-colors hover:bg-amber-100 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <p>
                  Có{' '}
                  <strong>{stats!.unassignedEmployees.toLocaleString('vi-VN')}</strong> nhân viên
                  chưa gán ca — quét cửa sẽ không được tính chấm công.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
                Vào phân ca
                <ChevronRight className="h-4 w-4" />
              </span>
            </Link>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {statItems.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-4 rounded-sm border border-border bg-surface p-4"
              >
                <div className="rounded-sm bg-secondary/20 p-2.5">
                  <s.icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="mb-0.5 text-label-caps uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="font-heading text-lg font-bold text-foreground">{s.value}</p>
                  {s.hint && <p className="truncate text-[10px] text-muted-foreground">{s.hint}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
            <div className="space-y-8 lg:col-span-3">
              <section className="rounded-sm border border-border bg-surface p-6 lg:p-8">
                <SectionHeader label="Vận hành" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
                  {operations.map((item) => (
                    <NavButton key={item.path} item={item} />
                  ))}
                </div>
              </section>

              <section className="rounded-sm border border-border bg-surface p-6 lg:p-8">
                <SectionHeader label="Cấu hình" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
                  {configs.map((item) => (
                    <NavButton key={item.path} item={item} />
                  ))}
                </div>
              </section>
            </div>

            {/* Recent activity */}
            <div className="lg:col-span-1">
              <div className="rounded-sm border border-border bg-surface p-5">
                <h2 className="mb-4 text-label-caps font-semibold uppercase tracking-[0.15em] text-foreground">
                  Hoạt động gần đây
                </h2>
                <div className="space-y-2">
                  {logs.length === 0 && (
                    <p className="text-sm text-muted-foreground">Chưa có hoạt động</p>
                  )}
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 rounded-sm border border-border px-3 py-2"
                    >
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          log.isValid === false ? 'bg-destructive' : 'bg-emerald-500',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {log.user?.fullName ?? 'Không xác định'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{log.device.name}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(log.eventAt).toLocaleTimeString('vi-VN')}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/reports"
                  className="mt-4 flex items-center justify-center gap-1 rounded-sm border border-primary/20 bg-primary/5 py-2 text-label-caps font-semibold uppercase tracking-wider text-foreground transition-colors hover:bg-primary/10"
                >
                  Xem báo cáo
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

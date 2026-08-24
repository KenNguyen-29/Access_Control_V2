'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Monitor,
  Users,
  Clock,
  LayoutGrid,
  CalendarClock,
  HardHat,
  Shield,
  Settings,
  LogOut,
  Building2,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';

const tabs = [
  { href: '/dashboard', id: 'dashboard', icon: Monitor, label: 'Giám sát' },
  { href: '/users', id: 'users', icon: Users, label: 'Nhân sự' },
  { href: '/access-control', id: 'access-control', icon: Shield, label: 'Phân quyền' },
  { href: '/shifts', id: 'shifts', icon: Clock, label: 'Ca làm' },
  { href: '/devices', id: 'devices', icon: LayoutGrid, label: 'Thiết bị' },
  { href: '/reports', id: 'reports', icon: CalendarClock, label: 'Chấm công' },
  { href: '/analytics', id: 'analytics', icon: TrendingUp, label: 'Thống kê' },
  { href: '/reports/contractors', id: 'reports-contractors', icon: HardHat, label: 'BC nhà thầu' },
  { href: '/projects', id: 'projects', icon: Building2, label: 'Dự án' },
  { href: '/settings', id: 'settings', icon: Settings, label: 'Cài đặt' },
];

function isTabActive(pathname: string, tab: (typeof tabs)[number]) {
  if (tab.id === 'reports') return pathname === '/reports';
  if (tab.id === 'reports-contractors') {
    return pathname === '/reports/contractors' || pathname.startsWith('/reports/contractors/');
  }
  if (tab.id === 'projects') {
    return (
      pathname === '/projects' ||
      pathname.startsWith('/projects/') ||
      pathname === '/settings/contractors' ||
      pathname.startsWith('/settings/contractors/')
    );
  }
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

function NavTab({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-sm px-2.5 py-1.5 transition-colors',
        active
          ? 'text-[hsl(var(--nav-foreground))]'
          : 'text-[hsl(var(--nav-foreground))]/60 hover:bg-white/10 hover:text-[hsl(var(--nav-foreground))]',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap text-[10px] font-semibold leading-none">{label}</span>
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-tab-indicator" />
      )}
    </Link>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const { signOut, account } = useAuth();
  const { canAccess } = usePermissions();
  const isHome = pathname === '/home' || pathname === '/';
  const visibleTabs = tabs.filter((tab) => canAccess(tab.href));

  return (
    <header className="fixed left-0 right-0 top-0 z-50 min-h-[4.5rem] border-b border-tertiary/15 bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-foreground))]">
      <div className="flex min-h-[4.5rem] items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-5">
          <Link
            href="/home"
            className="group flex shrink-0 items-center gap-2.5 border-r border-white/20 pr-4 transition-opacity hover:opacity-90 lg:pr-8"
          >
            <div className="flex h-9 items-center gap-2 lg:h-10 lg:gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" aria-hidden className="h-full w-auto shrink-0 object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo2.png" alt="TECHWAVE" className="max-h-full w-auto shrink-0 object-contain" />
            </div>
          </Link>

          <nav className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <NavTab href="/home" icon={Home} label="Trang chủ" active={isHome} />
            {visibleTabs.map((tab) => (
              <NavTab
                key={tab.id}
                href={tab.href}
                icon={tab.icon}
                label={tab.label}
                active={isTabActive(pathname, tab)}
              />
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-10 items-center gap-2.5 rounded-sm bg-white/10 px-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-white/20 text-xs font-bold">
              {(account?.username || 'A').slice(0, 1).toUpperCase()}
            </div>
            <div className="hidden pr-1 md:block">
              <p className="text-[10px] font-black uppercase tracking-widest">
                {account?.username || 'Admin'}
              </p>
              <p className="text-[8px] uppercase tracking-wider text-white/70">Access Control</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Đăng xuất"
            className="flex h-10 flex-col items-center justify-center gap-0.5 rounded-sm px-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden text-[10px] font-semibold leading-none sm:inline">Thoát</span>
          </button>
        </div>
      </div>
    </header>
  );
}

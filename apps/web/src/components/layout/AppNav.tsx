'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Monitor,
  Users,
  Clock,
  LayoutGrid,
  Activity,
  Shield,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const tabs = [
  { href: '/dashboard', id: 'dashboard', icon: Monitor, label: 'Giám sát' },
  { href: '/users', id: 'users', icon: Users, label: 'Nhân sự' },
  { href: '/access-control', id: 'access-control', icon: Shield, label: 'Phân quyền' },
  { href: '/shifts', id: 'shifts', icon: Clock, label: 'Ca làm' },
  { href: '/devices', id: 'devices', icon: LayoutGrid, label: 'Thiết bị' },
  { href: '/reports', id: 'reports', icon: Activity, label: 'Báo cáo' },
  { href: '/settings', id: 'settings', icon: Settings, label: 'Cài đặt' },
];

export function AppNav() {
  const pathname = usePathname();
  const { signOut, account } = useAuth();
  const isHome = pathname === '/home' || pathname === '/';

  return (
    <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-tertiary/15 bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-foreground))]">
      <div className="flex h-full items-center justify-between gap-8 px-6">
        <div className="flex shrink-0 items-center gap-6">
          <Link
            href="/home"
            className="group flex shrink-0 items-center gap-2.5 border-r border-white/20 pr-10 transition-opacity hover:opacity-90"
          >
            <div className="flex h-10 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" aria-hidden className="h-full w-auto shrink-0 object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo2.png" alt="TECHWAVE" className="max-h-full w-auto shrink-0 object-contain" />
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/home"
              title="Home"
              className={cn(
                'relative flex h-10 w-11 items-center justify-center rounded-sm transition-colors',
                isHome
                  ? 'text-[hsl(var(--nav-foreground))]'
                  : 'text-[hsl(var(--nav-foreground))]/60 hover:bg-white/10 hover:text-[hsl(var(--nav-foreground))]',
              )}
            >
              <Home className="h-4 w-4" />
              {isHome && (
                <span className="absolute -bottom-1 left-3 right-3 h-0.5 rounded-full bg-tab-indicator" />
              )}
            </Link>

            {tabs.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  title={tab.label}
                  className={cn(
                    'relative flex h-10 w-11 items-center justify-center rounded-sm transition-colors',
                    active
                      ? 'text-[hsl(var(--nav-foreground))]'
                      : 'text-[hsl(var(--nav-foreground))]/60 hover:bg-white/10 hover:text-[hsl(var(--nav-foreground))]',
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {active && (
                    <span className="absolute -bottom-1 left-3 right-3 h-0.5 rounded-full bg-tab-indicator" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-10 items-center gap-2.5 rounded-sm bg-white/10 px-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-white/20 text-xs font-bold">
              {(account?.username || 'A').slice(0, 1).toUpperCase()}
            </div>
            <div className="hidden pr-1 sm:block">
              <p className="text-[10px] font-black uppercase tracking-widest">
                {account?.username || 'Admin'}
              </p>
              <p className="text-[8px] uppercase tracking-wider text-white/70">Access Control</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Đăng xuất"
            className="flex h-10 w-11 items-center justify-center rounded-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AccessControlSidebar } from '@/components/access-control/AccessControlSidebar';
import type { AccessControlView } from '@/lib/accessControl';
import { MovedSettingsLinks } from '@/components/settings/MovedSettingsLinks';

// Only the active view's panel is loaded; the other two stay out of the initial bundle.
const panelLoading = () => (
  <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
    Đang tải...
  </div>
);

const PersonAccessPanel = dynamic(
  () => import('@/components/access-control/PersonAccessPanel').then((m) => m.PersonAccessPanel),
  { loading: panelLoading },
);
const AccessGroupPanel = dynamic(
  () => import('@/components/access-control/AccessGroupPanel').then((m) => m.AccessGroupPanel),
  { loading: panelLoading },
);
const AccessSearchPanel = dynamic(
  () => import('@/components/access-control/AccessSearchPanel').then((m) => m.AccessSearchPanel),
  { loading: panelLoading },
);

const VIEW_TITLE: Record<AccessControlView, string> = {
  byPerson: 'Theo nhân viên',
  accessGroup: 'Theo khu vực',
  search: 'Tra cứu',
};

export default function AccessControlPage() {
  const [view, setView] = useState<AccessControlView>('accessGroup');

  const renderContent = () => {
    if (view === 'search') return <AccessSearchPanel />;
    if (view === 'byPerson') return <PersonAccessPanel />;
    return <AccessGroupPanel />;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background font-body text-foreground">
      <div className="shrink-0 border-b border-border bg-card px-6 pb-4 pt-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="mb-2 inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Phân quyền
            </span>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Kiểm soát truy cập
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Quản lý quyền vào khu vực theo nhân viên hoặc theo nhóm khu vực, rồi đồng bộ xuống thiết bị.
            </p>
          </div>
          <MovedSettingsLinks
            sectionId="access"
            excludePath="/access-control"
            title="Ra vào — liên kết nhanh"
            description="Khu vực, thông tin đăng nhập và thiết bị."
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AccessControlSidebar active={view} onChange={setView} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">
          <div className="shrink-0 border-b border-border px-4 py-2">
            <h2 className="text-sm font-bold">{VIEW_TITLE[view]}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
}

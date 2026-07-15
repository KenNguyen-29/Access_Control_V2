'use client';

import { cn } from '@/lib/utils';
import type { AccessControlView } from '@/lib/accessControl';

interface AccessControlSidebarProps {
  active: AccessControlView;
  onChange: (view: AccessControlView) => void;
}

const NAV_ITEMS: Array<{ view: AccessControlView; label: string }> = [
  { view: 'byPerson', label: 'Theo nhân viên' },
  { view: 'accessGroup', label: 'Theo khu vực' },
  { view: 'search', label: 'Tra cứu' },
];

export function AccessControlSidebar({ active, onChange }: AccessControlSidebarProps) {
  const itemClass = (view: AccessControlView) =>
    cn(
      'relative w-full py-2 pl-8 pr-3 text-left text-xs transition-colors',
      active === view
        ? 'bg-muted font-semibold text-foreground'
        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    );

  return (
    <aside className="flex min-h-0 w-52 shrink-0 flex-col border-r border-border bg-card">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Phân quyền
        </p>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto py-2 text-sm">
        <p className="px-3 py-2 text-xs font-semibold text-muted-foreground">Phân quyền</p>
        {NAV_ITEMS.map(({ view, label }) => (
          <button
            key={view}
            type="button"
            className={itemClass(view)}
            onClick={() => onChange(view)}
          >
            {active === view && (
              <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-r bg-primary" />
            )}
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

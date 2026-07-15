'use client';

import { cn } from '@/lib/utils';
import { SETTINGS_NAV, type SettingsSectionId } from '@/lib/settingsCatalog';

interface SettingsSidebarProps {
  active: SettingsSectionId;
  onChange: (section: SettingsSectionId) => void;
  className?: string;
}

export function SettingsSidebar({ active, onChange, className }: SettingsSidebarProps) {
  return (
    <aside
      className={cn(
        'hidden min-h-0 w-52 shrink-0 flex-col border-r border-border bg-surface md:flex',
        className,
      )}
    >
      <nav className="min-h-0 flex-1 overflow-y-auto py-2">
        {SETTINGS_NAV.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={cn(
              'relative w-full py-2.5 pl-8 pr-3 text-left text-sm transition-colors',
              active === id
                ? 'bg-neutral font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-neutral/60 hover:text-foreground',
            )}
            onClick={() => onChange(id)}
          >
            {active === id && (
              <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-r bg-primary" />
            )}
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

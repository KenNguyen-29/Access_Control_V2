'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { SettingsLinkItem } from '@/lib/settingsCatalog';

interface SettingsLinkGridProps {
  items: SettingsLinkItem[];
}

export function SettingsLinkGrid({ items }: SettingsLinkGridProps) {
  if (items.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.path}
          className="group flex items-start gap-4 rounded-sm border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="shrink-0 rounded-sm bg-secondary/20 p-2.5 text-foreground">
            <item.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground group-hover:text-primary">
              {item.title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
      ))}
    </div>
  );
}

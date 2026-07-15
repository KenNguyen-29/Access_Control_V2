'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 -mt-1 inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-tertiary/5 hover:text-foreground"
      >
        {open ? 'Thu gọn' : title}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

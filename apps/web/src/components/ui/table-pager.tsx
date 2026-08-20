'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

function visiblePages(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, total, current]);
  if (current - 1 > 1) set.add(current - 1);
  if (current + 1 < total) set.add(current + 1);
  if (current <= 3) {
    set.add(2);
    set.add(3);
    set.add(4);
  }
  if (current >= total - 2) {
    set.add(total - 1);
    set.add(total - 2);
    set.add(total - 3);
  }
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | 'ellipsis'> = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (i > 0 && n - (sorted[i - 1] ?? 0) > 1) out.push('ellipsis');
    out.push(n);
  }
  return out;
}

export function TablePager({
  currentPage,
  totalPages,
  total,
  unit,
  onPageChange,
  className,
}: {
  currentPage: number;
  totalPages: number;
  total?: number;
  unit?: string;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, totalPages);
  const page = Math.min(Math.max(1, currentPage), pages);

  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3',
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        Trang {page} / {pages}
        {total != null ? ` · ${total}${unit ? ` ${unit}` : ''}` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {visiblePages(page, pages).map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? 'accent' : 'outline'}
              size="icon"
              className={cn('h-8 min-w-8 px-1 text-xs', item === page && 'pointer-events-none')}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang sau"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Select
          className="h-8 w-[7.5rem] py-0 text-xs"
          value={String(page)}
          onChange={(e) => onPageChange(Number(e.target.value))}
          aria-label="Chọn trang"
        >
          {Array.from({ length: pages }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              Trang {i + 1}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

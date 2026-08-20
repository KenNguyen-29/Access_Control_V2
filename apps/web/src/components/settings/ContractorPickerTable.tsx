'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type ContractorPickerRow = {
  id: string;
  name: string;
  code: string;
};

export function ContractorPickerTable({
  contractors,
  selectedIds,
  onChange,
  maxHeightClass = 'max-h-52',
}: {
  contractors: ContractorPickerRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  maxHeightClass?: string;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contractors;
    return contractors.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [contractors, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.includes(c.id));

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filtered.map((c) => c.id));
      onChange(selectedIds.filter((id) => !filteredSet.has(id)));
    } else {
      onChange([...new Set([...selectedIds, ...filtered.map((c) => c.id)])]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Tìm tên hoặc mã nhà thầu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 min-w-[12rem] flex-1"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          Đã chọn {selectedIds.length}/{contractors.length}
        </span>
      </div>
      <div className={cn('overflow-y-auto rounded-sm border border-border', maxHeightClass)}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={allFilteredSelected}
                  disabled={filtered.length === 0}
                  onChange={toggleAllFiltered}
                  aria-label="Chọn tất cả nhà thầu hiển thị"
                />
              </th>
              <th className="p-2 font-semibold">Tên nhà thầu</th>
              <th className="w-28 p-2 font-semibold">Mã</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-4 text-center text-xs text-muted-foreground">
                  {contractors.length === 0 ? 'Chưa có nhà thầu' : 'Không khớp tìm kiếm'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const checked = selectedIds.includes(c.id);
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      'cursor-pointer border-t border-border/60 hover:bg-muted/30',
                      checked && 'bg-primary/5',
                    )}
                    onClick={() => toggle(c.id)}
                  >
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        aria-label={`Chọn ${c.name}`}
                      />
                    </td>
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{c.code}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

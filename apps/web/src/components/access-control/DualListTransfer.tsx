'use client';

import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { UserInfiniteList } from '@/components/users/UserInfiniteList';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { getDepartments, type User } from '@/lib/api';

export interface DualListItem {
  id: string;
  label: string;
  subLabel?: string;
}

interface DualListTransferProps {
  title: string;
  available: DualListItem[];
  selected: DualListItem[];
  onChange: (selected: DualListItem[]) => void;
}

export function DualListTransfer({
  title,
  available,
  selected,
  onChange,
}: DualListTransferProps) {
  const [availSearch, setAvailSearch] = useState('');
  const [selSearch, setSelSearch] = useState('');
  const [checkedAvail, setCheckedAvail] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState('all');

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    available.forEach((a) => { if (a.subLabel) set.add(a.subLabel); });
    return [...set].sort();
  }, [available]);

  const filteredAvail = useMemo(
    () =>
      available.filter(
        (a) =>
          !selected.some((s) => s.id === a.id) &&
          a.label.toLowerCase().includes(availSearch.toLowerCase()) &&
          (groupFilter === 'all' || a.subLabel === groupFilter),
      ),
    [available, selected, availSearch, groupFilter],
  );

  const filteredSel = useMemo(
    () => selected.filter((s) => s.label.toLowerCase().includes(selSearch.toLowerCase())),
    [selected, selSearch],
  );

  const addSelected = () => {
    const toAdd = filteredAvail.filter((a) => checkedAvail.includes(a.id));
    if (toAdd.length === 0) return;
    onChange([...selected, ...toAdd]);
    setCheckedAvail([]);
  };

  const removeOne = (id: string) => onChange(selected.filter((s) => s.id !== id));

  const clearAll = () => onChange([]);

  return (
    <DualListLayout
      title={title}
      availSearch={availSearch}
      onAvailSearchChange={setAvailSearch}
      availFilter={
        groupOptions.length > 1 ? (
          <Select
            className="h-7 text-xs"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="all">Tất cả nhóm</option>
            {groupOptions.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        ) : undefined
      }
      selSearch={selSearch}
      onSelSearchChange={setSelSearch}
      availContent={
        filteredAvail.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Không có dữ liệu</p>
        ) : (
          filteredAvail.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-2 rounded p-1 text-xs hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
                checked={checkedAvail.includes(item.id)}
                onChange={(e) =>
                  setCheckedAvail((prev) =>
                    e.target.checked ? [...prev, item.id] : prev.filter((x) => x !== item.id),
                  )
                }
              />
              <DualListItemLabel item={item} />
            </label>
          ))
        )
      }
      onAdd={addSelected}
      addDisabled={checkedAvail.length === 0}
      selContent={
        filteredSel.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Không có dữ liệu</p>
        ) : (
          filteredSel.map((item) => (
            <div
              key={item.id}
              className={cn('flex items-center justify-between rounded p-1 text-xs hover:bg-muted/50')}
            >
              <DualListItemLabel item={item} />
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeOne(item.id)}
              >
                ×
              </button>
            </div>
          ))
        )
      }
      onClearSelected={clearAll}
    />
  );
}

interface UserDualListTransferProps {
  title: string;
  selected: DualListItem[];
  onChange: (selected: DualListItem[]) => void;
  enabled?: boolean;
}

function userToItem(user: User): DualListItem {
  return {
    id: user.id,
    label: user.fullName,
    subLabel: `${user.employeeCode ?? user.id.slice(0, 8)} · ${user.department?.name ?? '—'}`,
  };
}

export function UserDualListTransfer({
  title,
  selected,
  onChange,
  enabled = true,
}: UserDualListTransferProps) {
  const [search, setSearch] = useState('');
  const [selSearch, setSelSearch] = useState('');
  const [checkedAvail, setCheckedAvail] = useState<DualListItem[]>([]);
  const [deptFilter, setDeptFilter] = useState('all');
  const debouncedSearch = useDebouncedValue(search);

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments(),
  });
  const departments = departmentsQuery.data ?? [];

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const filteredSel = useMemo(
    () => selected.filter((s) => s.label.toLowerCase().includes(selSearch.toLowerCase())),
    [selected, selSearch],
  );

  const toggleChecked = (item: DualListItem, checked: boolean) => {
    setCheckedAvail((prev) =>
      checked ? [...prev, item] : prev.filter((x) => x.id !== item.id),
    );
  };

  const addSelected = () => {
    if (checkedAvail.length === 0) return;
    onChange([...selected, ...checkedAvail]);
    setCheckedAvail([]);
  };

  const removeOne = (id: string) => onChange(selected.filter((s) => s.id !== id));

  const departmentId = deptFilter === 'all' ? undefined : deptFilter;

  return (
    <DualListLayout
      title={title}
      availSearch={search}
      onAvailSearchChange={setSearch}
      availSearchPlaceholder="Tìm tên hoặc mã..."
      availFilter={
        departments.length > 0 ? (
          <Select
            className="h-7 text-xs"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="all">Tất cả phòng ban</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        ) : undefined
      }
      selSearch={selSearch}
      onSelSearchChange={setSelSearch}
      availContent={
        <UserInfiniteList
          enabled={enabled}
          search={debouncedSearch}
          departmentId={departmentId}
          emptyText="Không có nhân viên"
          renderItem={(user) => {
            if (selectedIds.has(user.id)) return null;
            const item = userToItem(user);
            const isChecked = checkedAvail.some((x) => x.id === user.id);
            return (
              <label
                key={user.id}
                className="flex cursor-pointer items-start gap-2 rounded p-1 text-xs hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 accent-primary"
                  checked={isChecked}
                  onChange={(e) => toggleChecked(item, e.target.checked)}
                />
                <DualListItemLabel item={item} />
              </label>
            );
          }}
        />
      }
      onAdd={addSelected}
      addDisabled={checkedAvail.length === 0}
      selContent={
        filteredSel.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Không có dữ liệu</p>
        ) : (
          filteredSel.map((item) => (
            <div
              key={item.id}
              className={cn('flex items-center justify-between rounded p-1 text-xs hover:bg-muted/50')}
            >
              <DualListItemLabel item={item} />
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeOne(item.id)}
              >
                ×
              </button>
            </div>
          ))
        )
      }
      onClearSelected={() => onChange([])}
    />
  );
}

function DualListItemLabel({ item }: { item: DualListItem }) {
  return (
    <span>
      <span className="font-medium">{item.label}</span>
      {item.subLabel && (
        <span className="block text-[10px] text-muted-foreground">{item.subLabel}</span>
      )}
    </span>
  );
}

function DualListLayout({
  title,
  availSearch,
  onAvailSearchChange,
  availSearchPlaceholder = 'Lọc...',
  availFilter,
  selSearch,
  onSelSearchChange,
  availContent,
  onAdd,
  addDisabled,
  selContent,
  onClearSelected,
}: {
  title: string;
  availSearch: string;
  onAvailSearchChange: (v: string) => void;
  availSearchPlaceholder?: string;
  availFilter?: React.ReactNode;
  selSearch: string;
  onSelSearchChange: (v: string) => void;
  availContent: React.ReactNode;
  onAdd: () => void;
  addDisabled?: boolean;
  selContent: React.ReactNode;
  onClearSelected: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <div className="grid min-h-[200px] grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="flex flex-col rounded-sm border border-border bg-white">
          <div className="border-b border-border bg-muted/50 px-2 py-1.5 text-xs font-semibold">
            Có sẵn
          </div>
          <div className="space-y-1.5 border-b border-border p-2">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-7 text-xs"
                  placeholder={availSearchPlaceholder}
                  value={availSearch}
                  onChange={(e) => onAvailSearchChange(e.target.value)}
                />
              </div>
            </div>
            {availFilter}
          </div>
          <div className="max-h-40 flex-1 space-y-1 overflow-y-auto p-2">{availContent}</div>
        </div>

        <div className="flex flex-col justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={onAdd}
            disabled={addDisabled}
          >
            &gt;
          </Button>
        </div>

        <div className="flex flex-col rounded-sm border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-2 py-1.5 text-xs font-semibold">
            <span>Đã chọn</span>
            <button type="button" onClick={onClearSelected} title="Xóa tất cả">
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-xs"
                placeholder="Lọc..."
                value={selSearch}
                onChange={(e) => onSelSearchChange(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-40 flex-1 space-y-1 overflow-y-auto p-2">{selContent}</div>
        </div>
      </div>
    </div>
  );
}

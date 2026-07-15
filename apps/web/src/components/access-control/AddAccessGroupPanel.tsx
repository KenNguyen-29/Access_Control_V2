'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DualListTransfer, UserDualListTransfer } from '@/components/access-control/DualListTransfer';
import type { AccessGroup, AccessPerson, AccessPoint } from '@/lib/accessControl';

interface AddAccessGroupPanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (group: Omit<AccessGroup, 'id' | 'status'>) => void | Promise<void>;
  editGroup?: AccessGroup | null;
  accessPointOptions: AccessPoint[];
  scheduleTemplates: string[];
  saving?: boolean;
}

function itemToPerson(item: { id: string; label: string; subLabel?: string }): AccessPerson {
  const parts = item.subLabel?.split(' · ') ?? [];
  return {
    id: item.id,
    name: item.label,
    personId: parts[0] ?? item.id.slice(0, 8),
    organization: parts[1] ?? '—',
  };
}

export function AddAccessGroupPanel({
  open,
  onClose,
  onSave,
  editGroup,
  accessPointOptions,
  scheduleTemplates,
  saving = false,
}: AddAccessGroupPanelProps) {
  const [name, setName] = useState('');
  const [scheduleTemplate, setScheduleTemplate] = useState(scheduleTemplates[0] ?? '');
  const [selectedPersons, setSelectedPersons] = useState<
    { id: string; label: string; subLabel?: string }[]
  >([]);
  const [selectedPoints, setSelectedPoints] = useState<
    { id: string; label: string; subLabel?: string }[]
  >([]);

  useEffect(() => {
    if (open && editGroup) {
      setName(editGroup.name);
      setScheduleTemplate(editGroup.scheduleTemplate);
      setSelectedPersons(
        editGroup.persons.map((p) => ({
          id: p.id,
          label: p.name,
          subLabel: `${p.personId} · ${p.organization}`,
        })),
      );
      setSelectedPoints(
        editGroup.accessPoints.map((p) => ({
          id: p.id,
          label: p.name,
          subLabel: p.groupName,
        })),
      );
    } else if (open) {
      setName('');
      setScheduleTemplate(scheduleTemplates[0] ?? '');
      setSelectedPersons([]);
      setSelectedPoints([]);
    }
  }, [open, editGroup, scheduleTemplates]);

  if (!open) return null;

  const pointAvailable = accessPointOptions.map((p) => ({
    id: p.id,
    label: p.name,
    subLabel: p.groupName,
  }));

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave({
      name: name.trim(),
      scheduleTemplate,
      persons: selectedPersons.map(itemToPerson),
      accessPoints: selectedPoints
        .map((s) => accessPointOptions.find((x) => x.id === s.id))
        .filter((p): p is AccessPoint => Boolean(p)),
    });
    onClose();
  };

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-[480px] max-w-full flex-col border-l border-border bg-white shadow-xl">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-bold text-foreground">
          {editGroup ? 'Sửa nhóm khu vực' : 'Thêm nhóm khu vực'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto bg-white p-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Tên khu vực <span className="text-destructive">*</span>
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Lịch làm việc <span className="text-destructive">*</span>
          </label>
          <Select
            value={scheduleTemplate}
            onChange={(e) => setScheduleTemplate(e.target.value)}
            className="bg-white"
          >
            {scheduleTemplates.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        <UserDualListTransfer
          title="Chọn nhân viên"
          selected={selectedPersons}
          onChange={setSelectedPersons}
          enabled={open}
        />

        <DualListTransfer
          title="Chọn điểm truy cập"
          available={pointAvailable}
          selected={selectedPoints}
          onChange={setSelectedPoints}
        />
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-white px-4 py-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Hủy
        </Button>
        <Button
          type="button"
          variant="accent"
          onClick={() => void handleSave()}
          disabled={!name.trim() || saving}
        >
          Lưu
        </Button>
      </div>
    </div>
  );
}

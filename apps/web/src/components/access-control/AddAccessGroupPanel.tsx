'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { FieldError, RequiredMark } from '@/components/ui/field-error';
import { DualListTransfer, UserDualListTransfer } from '@/components/access-control/DualListTransfer';
import type { AccessGroup, AccessPerson, AccessPoint } from '@/lib/accessControl';
import {
  clearFieldError,
  hasFormErrors,
  validateAccessGroupForm,
  type FieldErrors,
} from '@/lib/formValidation';
import { cn } from '@/lib/utils';

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

type AccessGroupFieldErrors = FieldErrors<'name' | 'scheduleTemplate'>;

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
  const [fieldErrors, setFieldErrors] = useState<AccessGroupFieldErrors>({});

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
      setFieldErrors({});
    } else if (open) {
      setName('');
      setScheduleTemplate(scheduleTemplates[0] ?? '');
      setSelectedPersons([]);
      setSelectedPoints([]);
      setFieldErrors({});
    }
  }, [open, editGroup, scheduleTemplates]);

  if (!open) return null;

  const pointAvailable = accessPointOptions.map((p) => ({
    id: p.id,
    label: p.name,
    subLabel: p.groupName,
  }));

  const handleSave = async () => {
    const errors = validateAccessGroupForm({ name, scheduleTemplate });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) return;
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
    <Dialog
      open={open}
      onClose={onClose}
      title={editGroup ? 'Sửa nhóm khu vực' : 'Thêm nhóm khu vực'}
      className="w-[min(96vw,560px)] max-w-none"
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Tên khu vực
            <RequiredMark />
          </label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFieldErrors((prev) => clearFieldError(prev, 'name'));
            }}
            className={cn(fieldErrors.name && 'border-destructive')}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          <FieldError message={fieldErrors.name} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Lịch làm việc
            <RequiredMark />
          </label>
          <Select
            value={scheduleTemplate}
            onChange={(e) => {
              setScheduleTemplate(e.target.value);
              setFieldErrors((prev) => clearFieldError(prev, 'scheduleTemplate'));
            }}
            className={cn(fieldErrors.scheduleTemplate && 'border-destructive')}
            aria-invalid={Boolean(fieldErrors.scheduleTemplate)}
          >
            {scheduleTemplates.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <FieldError message={fieldErrors.scheduleTemplate} />
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

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Hủy
        </Button>
        <Button
          type="button"
          variant="accent"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          Lưu
        </Button>
      </div>
    </Dialog>
  );
}

'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DesignCard } from '@/components/design/PageShell';

export type AttendanceSettingsValues = {
  lateGrace: string;
  earlyLeaveGrace: string;
  punchCooldown: string;
  otAfter: string;
  otMultiplier: string;
};

interface SettingsAttendancePanelProps {
  values: AttendanceSettingsValues;
  saving: boolean;
  loading: boolean;
  onChange: (patch: Partial<AttendanceSettingsValues>) => void;
  onSave: () => void;
  /** Bỏ DesignCard khi dùng trong modal. */
  bare?: boolean;
}

function AttendanceFields({
  values,
  saving,
  loading,
  onChange,
  onSave,
}: Omit<SettingsAttendancePanelProps, 'bare'>) {
  return (
    <div className="max-w-xl space-y-4">
      {(
        [
          ['lateGrace', 'Grace muộn (phút)', 'Sàn tối thiểu; ca có grace cao hơn sẽ được dùng'],
          ['earlyLeaveGrace', 'Grace về sớm (phút)', 'Về sớm trong khoảng này không tính early leave'],
          ['punchCooldown', 'Chống quét trùng (phút)', 'Bỏ qua check-out trong N phút sau check-in'],
          ['otAfter', 'OT sau giờ ra (phút)', 'Phút sau giờ kết thúc ca mới bắt đầu tính OT'],
          ['otMultiplier', 'Hệ số công OT', 'Hệ số ngày làm khi có OT (mặc định 1.25)'],
        ] as const
      ).map(([key, label, hint]) => (
        <label key={key} className="block space-y-1">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <Input
            type="number"
            className="h-9 max-w-[200px]"
            value={values[key]}
            disabled={loading || saving}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </label>
      ))}
      <Button disabled={saving || loading} onClick={onSave}>
        {saving ? 'Đang lưu...' : 'Lưu'}
      </Button>
    </div>
  );
}

export function SettingsAttendancePanel({
  bare = false,
  ...props
}: SettingsAttendancePanelProps) {
  const fields = <AttendanceFields {...props} />;
  if (bare) return fields;

  return (
    <DesignCard
      title="Quy tắc chấm công"
      description="Grace muộn/về sớm, chống quét trùng và OT toàn hệ thống"
    >
      {fields}
    </DesignCard>
  );
}

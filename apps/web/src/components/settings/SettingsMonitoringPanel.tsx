'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DesignCard } from '@/components/design/PageShell';

export type MonitoringSettingsValues = {
  layout: string;
  popupTimeoutMs: string;
  alertSound: boolean;
};

interface SettingsMonitoringPanelProps {
  values: MonitoringSettingsValues;
  saving: boolean;
  loading: boolean;
  onChange: (patch: Partial<MonitoringSettingsValues>) => void;
  onSave: () => void;
}

export function SettingsMonitoringPanel({
  values,
  saving,
  loading,
  onChange,
  onSave,
}: SettingsMonitoringPanelProps) {
  return (
    <DesignCard
      title="Giám sát camera"
      description="Layout mặc định, thời gian toast check-in và âm báo sự cố"
    >
      <div className="max-w-xl space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Layout camera mặc định</span>
          <Select
            className="h-9 max-w-[200px]"
            value={values.layout}
            disabled={loading || saving}
            onChange={(e) => onChange({ layout: e.target.value })}
          >
            <option value="1">1×1</option>
            <option value="4">2×2</option>
            <option value="6">2×3</option>
            <option value="9">3×3</option>
            <option value="16">4×4</option>
          </Select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Timeout popup check-in (ms)</span>
          <Input
            type="number"
            className="h-9 max-w-[200px]"
            min={1000}
            max={60000}
            value={values.popupTimeoutMs}
            disabled={loading || saving}
            onChange={(e) => onChange({ popupTimeoutMs: e.target.value })}
          />
        </label>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <input
            id="alert_sound"
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={values.alertSound}
            disabled={loading || saving}
            onChange={(e) => onChange({ alertSound: e.target.checked })}
          />
          <label htmlFor="alert_sound" className="cursor-pointer text-sm text-muted-foreground">
            Bật âm báo khi có sự kiện khẩn cấp / cảnh báo
          </label>
        </div>

        <Button disabled={saving || loading} onClick={onSave}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>
    </DesignCard>
  );
}

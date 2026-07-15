'use client';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { DesignCard } from '@/components/design/PageShell';

interface SettingsGeneralPanelProps {
  dateFormat: string;
  autoLogout: boolean;
  saving: boolean;
  loading: boolean;
  onDateFormatChange: (format: string) => void;
  onAutoLogoutChange: (enabled: boolean) => void;
  onSave: () => void;
  onReset: () => void;
}

export function SettingsGeneralPanel({
  dateFormat,
  autoLogout,
  saving,
  loading,
  onDateFormatChange,
  onAutoLogoutChange,
  onSave,
  onReset,
}: SettingsGeneralPanelProps) {
  return (
    <DesignCard title="Cài đặt chung" description="Định dạng ngày và tự động đăng xuất">
      <div className="max-w-xl space-y-5">
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-4">
          <span className="text-sm font-medium text-foreground">Định dạng ngày</span>
          <Select
            className="h-9 w-full sm:max-w-[240px]"
            value={dateFormat}
            onChange={(e) => onDateFormatChange(e.target.value)}
            disabled={loading || saving}
          >
            <option value="yyyy/MM/dd">yyyy/MM/dd</option>
            <option value="dd/MM/yyyy">dd/MM/yyyy</option>
          </Select>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <input
            id="auto_logout"
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={autoLogout}
            onChange={(e) => onAutoLogoutChange(e.target.checked)}
            disabled={loading || saving}
          />
          <label htmlFor="auto_logout" className="cursor-pointer text-sm text-muted-foreground">
            Tự động đăng xuất khi không hoạt động
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" disabled={saving || loading} onClick={onReset}>
            Mặc định
          </Button>
          <Button disabled={saving || loading} onClick={onSave}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </div>
      </div>
    </DesignCard>
  );
}

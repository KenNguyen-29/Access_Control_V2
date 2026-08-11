'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DesignCard } from '@/components/design/PageShell';

export type IntegrationSettingsValues = {
  webhookToken: string;
  allowedIps: string;
  mockMode: boolean;
  monitorPushUrl: string;
  monitorPushSecret: string;
  monitorPushEnabled: boolean;
};

type IntegrationStatus = {
  akuvox: {
    webhookUrl: string;
    tokenConfigured: boolean;
    allowedIps: string;
    mockMode: boolean;
    source: { token: string; ips: string };
  };
  redis: {
    enabled: boolean;
    status: boolean | 'skipped';
    host: string;
    port: string;
    note: string;
  };
};

interface SettingsIntegrationPanelProps {
  values: IntegrationSettingsValues;
  status: IntegrationStatus | null;
  saving: boolean;
  loading: boolean;
  onChange: (patch: Partial<IntegrationSettingsValues>) => void;
  onSave: () => void;
  onRefreshStatus: () => void;
}

export function SettingsIntegrationPanel({
  values,
  status,
  saving,
  loading,
  onChange,
  onSave,
  onRefreshStatus,
}: SettingsIntegrationPanelProps) {
  return (
    <div className="space-y-4">
      <DesignCard title="Akuvox webhook" description="URL, token và IP allowlist">
        <div className="max-w-2xl space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Webhook URL</p>
            <p className="mt-1 break-all font-mono text-sm">{status?.akuvox.webhookUrl ?? '—'}</p>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Webhook token</span>
            <Input
              className="h-9 font-mono"
              value={values.webhookToken}
              disabled={loading || saving}
              placeholder={status?.akuvox.tokenConfigured ? '**** (đã cấu hình)' : 'Nhập token mới'}
              onChange={(e) => onChange({ webhookToken: e.target.value })}
            />
            <span className="block text-xs text-muted-foreground">
              Để trống hoặc giữ giá trị che (****) nếu không đổi. Nguồn: {status?.akuvox.source.token ?? '—'}
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">IP allowlist (phân tách bằng dấu phẩy)</span>
            <Input
              className="h-9 font-mono"
              value={values.allowedIps}
              disabled={loading || saving}
              onChange={(e) => onChange({ allowedIps: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-3">
            <input
              id="akuvox_mock"
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={values.mockMode}
              disabled={loading || saving}
              onChange={(e) => onChange({ mockMode: e.target.checked })}
            />
            <label htmlFor="akuvox_mock" className="text-sm text-muted-foreground">
              Mock mode (không gọi API thiết bị thật)
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={loading} onClick={onRefreshStatus}>
              Làm mới trạng thái
            </Button>
            <Button disabled={saving || loading} onClick={onSave}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </DesignCard>

      <DesignCard title="Redis" description="Trạng thái cache / queue (cấu hình qua env)">
        <div className="space-y-2 text-sm">
          <p>
            Bật: <strong>{status?.redis.enabled ? 'Có' : 'Không'}</strong>
          </p>
          <p>
            Health:{' '}
            <strong>
              {status?.redis.status === 'skipped'
                ? 'bỏ qua'
                : status?.redis.status
                  ? 'ok'
                  : 'lỗi / không kết nối'}
            </strong>
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {status?.redis.host}:{status?.redis.port}
          </p>
          <p className="text-xs text-muted-foreground">{status?.redis.note}</p>
        </div>
      </DesignCard>

      <DesignCard
        title="Hệ giám sát chung"
        description="Đẩy headcount nhà thầu hàng ngày (cron 00:05 hoặc nút Snapshot trên báo cáo)."
      >
        <div className="max-w-2xl space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Push URL</span>
            <Input
              className="h-9 font-mono"
              value={values.monitorPushUrl}
              disabled={loading || saving}
              placeholder="https://monitor.example.com/api/headcount"
              onChange={(e) => onChange({ monitorPushUrl: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Bearer secret</span>
            <Input
              className="h-9 font-mono"
              value={values.monitorPushSecret}
              disabled={loading || saving}
              placeholder="****"
              onChange={(e) => onChange({ monitorPushSecret: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-3">
            <input
              id="monitor_push_enabled"
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={values.monitorPushEnabled}
              disabled={loading || saving}
              onChange={(e) => onChange({ monitorPushEnabled: e.target.checked })}
            />
            <label htmlFor="monitor_push_enabled" className="text-sm text-muted-foreground">
              Bật cron đẩy tự động mỗi ngày
            </label>
          </div>
          <Button disabled={saving || loading} onClick={onSave}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </div>
      </DesignCard>
    </div>
  );
}

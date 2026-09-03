'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldError } from '@/components/ui/field-error';
import { PageShell, DesignCard } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import { SETTING_KEYS } from '@/lib/settingsCatalog';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  getSystemSettings,
  runRetentionNow,
  upsertSystemSetting,
} from '@/lib/api';
import { validateRetentionDays } from '@/lib/formValidation';
import { cn } from '@/lib/utils';

const PRESETS = [
  { days: 30, label: '30 ngày' },
  { days: 180, label: '6 tháng' },
  { days: 365, label: '1 năm' },
] as const;

export default function StorageSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState('');
  const [customError, setCustomError] = useState<string | undefined>();
  const [snapshotDays, setSnapshotDays] = useState('');
  const [snapshotError, setSnapshotError] = useState<string | undefined>();

  const settingsQuery = useQuery({
    queryKey: queryKeys.systemSettings(),
    queryFn: () => getSystemSettings(),
  });

  const map = useMemo(() => {
    const all = settingsQuery.data ?? [];
    return Object.fromEntries(all.map((s) => [s.key, s.value]));
  }, [settingsQuery.data]);

  const retentionEnabled = (map[SETTING_KEYS.RETENTION_ENABLED] ?? 'true') === 'true';
  const logDays = Number(map[SETTING_KEYS.LOG_RETENTION_DAYS] ?? '90');
  const attendanceDays = Number(map[SETTING_KEYS.ATTENDANCE_RETENTION_DAYS] ?? '90');
  const storageDays = Number(map[SETTING_KEYS.STORAGE_RETENTION_DAYS] ?? '30');
  const sharedDays = Number.isFinite(logDays) ? logDays : 90;

  const loading = settingsQuery.isLoading;
  const displayError =
    error ??
    (settingsQuery.error instanceof ApiError
      ? settingsQuery.error.message
      : settingsQuery.error
        ? 'Không tải được cấu hình lưu trữ'
        : null);

  function load() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
  }

  const saveMutation = useMutation({
    mutationFn: async (entries: Array<{ key: string; value: string }>) => {
      await Promise.all(entries.map((e) => upsertSystemSetting(e.key, e.value)));
    },
    onSuccess: () => {
      setNotice('Đã cập nhật cấu hình');
      setCustomError(undefined);
      setSnapshotError(undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Cập nhật thất bại'),
  });

  const purgeMutation = useMutation({
    mutationFn: () => runRetentionNow(),
    onSuccess: (result) => {
      const r = result as { skipped?: boolean; reason?: string; accessLogDeleted?: number };
      if (r?.skipped) {
        setNotice(
          r.reason === 'disabled'
            ? 'Tự xóa đang tắt — không chạy purge'
            : 'Purge đang chạy hoặc bị bỏ qua',
        );
      } else {
        setNotice(
          `Đã xóa: access log ${r?.accessLogDeleted ?? 0} bản ghi (và dữ liệu cũ theo cấu hình)`,
        );
      }
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Chạy xóa thất bại'),
  });

  function setEnabled(next: boolean) {
    setError(null);
    setNotice(null);
    saveMutation.mutate([{ key: SETTING_KEYS.RETENTION_ENABLED, value: String(next) }]);
  }

  function applySharedDays(days: number) {
    const err = validateRetentionDays(String(days));
    if (err) {
      setCustomError(err);
      setError('Vui lòng kiểm tra lại số ngày');
      return;
    }
    setError(null);
    setNotice(null);
    setCustomDays(String(days));
    saveMutation.mutate([
      { key: SETTING_KEYS.LOG_RETENTION_DAYS, value: String(days) },
      { key: SETTING_KEYS.ATTENDANCE_RETENTION_DAYS, value: String(days) },
    ]);
  }

  function saveCustomShared() {
    const err = validateRetentionDays(customDays.trim() || String(sharedDays));
    setCustomError(err);
    if (err) {
      setError('Vui lòng kiểm tra lại số ngày');
      return;
    }
    applySharedDays(Number(customDays.trim()));
  }

  function saveSnapshotDays() {
    const value = snapshotDays.trim() || String(storageDays);
    const err = validateRetentionDays(value);
    setSnapshotError(err);
    if (err) {
      setError('Vui lòng kiểm tra lại số ngày snapshot');
      return;
    }
    setError(null);
    setNotice(null);
    saveMutation.mutate([{ key: SETTING_KEYS.STORAGE_RETENTION_DAYS, value }]);
  }

  return (
    <PageShell
      title="Lưu trữ"
      subtitle="Tự động xóa access log, chấm công và snapshot theo số ngày cấu hình"
      badge="Settings"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNotice(null);
              setError(null);
              purgeMutation.mutate();
            }}
            disabled={purgeMutation.isPending || !retentionEnabled}
            title={
              retentionEnabled
                ? 'Chạy xóa ngay theo cấu hình hiện tại'
                : 'Bật tự động xóa trước khi chạy thủ công'
            }
          >
            <Trash2 className="h-4 w-4" />
            {purgeMutation.isPending ? 'Đang xóa...' : 'Chạy xóa ngay'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        </div>
      }
    >
      {notice && (
        <p className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      <QueryBoundary isLoading={loading} error={displayError} onRetry={() => load()}>
        <div className="grid gap-4 lg:grid-cols-2">
          <DesignCard
            title="Tự động xóa dữ liệu cũ"
            actions={<HardDrive className="h-5 w-5 text-muted-foreground" />}
          >
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-border px-3 py-3">
              <div>
                <p className="text-sm font-medium">Bật tự động xóa</p>
                <p className="text-xs text-muted-foreground">
                  Job chạy hàng ngày lúc 03:00. Tắt thì cron và nút xóa thủ công đều bỏ qua.
                </p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary"
                checked={retentionEnabled}
                disabled={saveMutation.isPending}
                onChange={(e) => setEnabled(e.target.checked)}
              />
            </label>
          </DesignCard>

          <DesignCard
            title="Thời gian giữ log & chấm công"
            actions={<HardDrive className="h-5 w-5 text-muted-foreground" />}
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Áp dụng cùng số ngày cho access log và lịch sử chấm công. Hiện tại:{' '}
              <strong className="text-foreground">{sharedDays} ngày</strong>
              {attendanceDays !== logDays ? (
                <span className="text-amber-700">
                  {' '}
                  (attendance đang {attendanceDays} ngày — chọn preset/custom để đồng bộ)
                </span>
              ) : null}
            </p>

            <div className="mb-3 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.days}
                  type="button"
                  size="sm"
                  variant={sharedDays === p.days && attendanceDays === p.days ? 'accent' : 'outline'}
                  disabled={saveMutation.isPending}
                  onClick={() => applySharedDays(p.days)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">
                  Tùy chỉnh (số ngày)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  className={cn('h-9', customError && 'border-destructive')}
                  placeholder={String(sharedDays)}
                  value={customDays}
                  onChange={(e) => {
                    setCustomDays(e.target.value);
                    setCustomError(undefined);
                  }}
                  onFocus={() => {
                    if (!customDays) setCustomDays(String(sharedDays));
                  }}
                />
                <FieldError message={customError} />
              </div>
              <Button
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => saveCustomShared()}
              >
                Lưu
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Preset nhanh: 30 ngày · 6 tháng (180) · 1 năm (365). Custom: 1–3650 ngày.
            </p>
          </DesignCard>

          <DesignCard
            title="Giữ snapshot / ảnh chấm"
            actions={<HardDrive className="h-5 w-5 text-muted-foreground" />}
            className="lg:col-span-2"
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Riêng file ảnh snapshot trên storage. Hiện tại:{' '}
              <strong className="text-foreground">{storageDays} ngày</strong>
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] max-w-xs flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">Số ngày</label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  className={cn('h-9', snapshotError && 'border-destructive')}
                  placeholder={String(storageDays)}
                  value={snapshotDays}
                  onChange={(e) => {
                    setSnapshotDays(e.target.value);
                    setSnapshotError(undefined);
                  }}
                  onFocus={() => {
                    if (!snapshotDays) setSnapshotDays(String(storageDays));
                  }}
                />
                <FieldError message={snapshotError} />
              </div>
              <Button
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => saveSnapshotDays()}
              >
                Lưu snapshot
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={() => {
                  setSnapshotDays(String(sharedDays));
                  const err = validateRetentionDays(String(sharedDays));
                  if (err) {
                    setSnapshotError(err);
                    return;
                  }
                  saveMutation.mutate([
                    { key: SETTING_KEYS.STORAGE_RETENTION_DAYS, value: String(sharedDays) },
                  ]);
                }}
              >
                Đồng bộ với log ({sharedDays} ngày)
              </Button>
            </div>
          </DesignCard>
        </div>
      </QueryBoundary>
    </PageShell>
  );
}

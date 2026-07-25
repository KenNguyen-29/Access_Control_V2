'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Check, X, Pencil, RefreshCw } from 'lucide-react';
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
  upsertSystemSetting,
  type SystemSetting,
} from '@/lib/api';
import { validateAttendanceRetentionDays, validateRetentionDays } from '@/lib/formValidation';
import { cn } from '@/lib/utils';

const STORAGE_KEYS = [
  SETTING_KEYS.LOG_RETENTION_DAYS,
  SETTING_KEYS.STORAGE_RETENTION_DAYS,
  SETTING_KEYS.ATTENDANCE_RETENTION_DAYS,
] as const;

const LABELS: Record<string, string> = {
  [SETTING_KEYS.LOG_RETENTION_DAYS]: 'Giữ access log (ngày)',
  [SETTING_KEYS.STORAGE_RETENTION_DAYS]: 'Giữ snapshot / lưu trữ (ngày)',
  [SETTING_KEYS.ATTENDANCE_RETENTION_DAYS]: 'Giữ lịch sử chấm công (ngày)',
};

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.LOG_RETENTION_DAYS]: '90',
  [SETTING_KEYS.STORAGE_RETENTION_DAYS]: '30',
  [SETTING_KEYS.ATTENDANCE_RETENTION_DAYS]: '90',
};

export default function StorageSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: queryKeys.systemSettings(),
    queryFn: () => getSystemSettings(),
  });

  const loading = settingsQuery.isLoading;
  const displayError =
    error ??
    (settingsQuery.error instanceof ApiError
      ? settingsQuery.error.message
      : settingsQuery.error
        ? 'Không tải được cấu hình lưu trữ'
        : null);

  const settings = useMemo(() => {
    const all = settingsQuery.data ?? [];
    const byKey = Object.fromEntries(
      all.filter((s) => (STORAGE_KEYS as readonly string[]).includes(s.key)).map((s) => [s.key, s]),
    );
    return STORAGE_KEYS.map(
      (key) =>
        byKey[key] ??
        ({ id: key, key, value: DEFAULTS[key] ?? '30' } as SystemSetting),
    );
  }, [settingsQuery.data]);

  function load() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
  }

  function startEdit(s: SystemSetting) {
    setEditingKey(s.key);
    setEditValue(s.value);
    setFieldError(undefined);
  }

  const saveMutation = useMutation({
    mutationFn: (key: string) => upsertSystemSetting(key, editValue.trim()),
    onSuccess: () => {
      setEditingKey(null);
      setNotice('Đã cập nhật cấu hình');
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Cập nhật thất bại'),
  });
  const saving = saveMutation.isPending;

  function saveEdit(key: string) {
    const err =
      key === SETTING_KEYS.ATTENDANCE_RETENTION_DAYS
        ? validateAttendanceRetentionDays(editValue)
        : validateRetentionDays(editValue);
    setFieldError(err);
    if (err) {
      setError('Vui lòng kiểm tra lại thông tin đã nhập');
      return;
    }
    setError(null);
    setNotice(null);
    saveMutation.mutate(key);
  }

  return (
    <PageShell
      title="Lưu trữ"
      subtitle="Thời gian giữ access log, snapshot và lịch sử chấm công"
      badge="Settings"
      actions={
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </Button>
      }
    >
      {notice && (
        <p className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      <QueryBoundary isLoading={loading} error={displayError} onRetry={() => load()}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {settings.map((s) => (
            <DesignCard
              key={s.key}
              title={LABELS[s.key] ?? s.key}
              actions={<HardDrive className="h-5 w-5 text-muted-foreground" />}
            >
              {editingKey === s.key ? (
                <div>
                  <div className="flex items-center gap-2">
                    <Input
                      className={cn('h-9 max-w-[120px]', fieldError && 'border-destructive')}
                      type="number"
                      min={s.key === SETTING_KEYS.ATTENDANCE_RETENTION_DAYS ? 60 : 1}
                      max={s.key === SETTING_KEYS.ATTENDANCE_RETENTION_DAYS ? 90 : 3650}
                      value={editValue}
                      onChange={(e) => {
                        setEditValue(e.target.value);
                        setFieldError(undefined);
                      }}
                      aria-invalid={Boolean(fieldError)}
                    />
                    <Button size="icon" disabled={saving} onClick={() => saveEdit(s.key)} title="Lưu">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        setEditingKey(null);
                        setFieldError(undefined);
                      }}
                      title="Hủy"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <FieldError message={fieldError} />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="font-heading text-2xl font-bold">{s.value}</p>
                  <Button size="sm" variant="outline" onClick={() => startEdit(s)}>
                    <Pencil className="h-4 w-4" />
                    Sửa
                  </Button>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground font-mono">{s.key}</p>
              {s.key === SETTING_KEYS.ATTENDANCE_RETENTION_DAYS && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tự động xoá bản ghi chấm công cũ hơn N ngày (chỉ cho phép 60–90). Job chạy hàng ngày
                  lúc 03:00.
                </p>
              )}
            </DesignCard>
          ))}
        </div>
      </QueryBoundary>
    </PageShell>
  );
}

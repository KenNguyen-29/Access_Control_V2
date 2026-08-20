'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryBoundary } from '@/components/ui/query-states';
import {
  SettingsAttendancePanel,
  type AttendanceSettingsValues,
} from '@/components/settings/SettingsAttendancePanel';
import { SETTING_KEYS } from '@/lib/settingsCatalog';
import { queryKeys } from '@/lib/queryKeys';
import { ApiError, getSystemSettings, upsertSystemSetting } from '@/lib/api';

const DEFAULT_ATTENDANCE: AttendanceSettingsValues = {
  lateGrace: '5',
  earlyLeaveGrace: '5',
  punchCooldown: '5',
  otAfter: '0',
  otMultiplier: '1.25',
};

/** Quy tắc chấm công — tab Log ra vào (màn Chấm công / Báo cáo). */
export function ReportsLogsConfigPanel() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<AttendanceSettingsValues>(DEFAULT_ATTENDANCE);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: queryKeys.systemSettings(),
    queryFn: () => getSystemSettings(),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const map = Object.fromEntries(settingsQuery.data.map((s) => [s.key, s.value]));
    setValues({
      lateGrace: map[SETTING_KEYS.ATTENDANCE_LATE_GRACE_MINUTES] || DEFAULT_ATTENDANCE.lateGrace,
      earlyLeaveGrace:
        map[SETTING_KEYS.ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES] ||
        DEFAULT_ATTENDANCE.earlyLeaveGrace,
      punchCooldown:
        map[SETTING_KEYS.PUNCH_COOLDOWN_MINUTES] || DEFAULT_ATTENDANCE.punchCooldown,
      otAfter: map[SETTING_KEYS.OT_AFTER_MINUTES] || DEFAULT_ATTENDANCE.otAfter,
      otMultiplier: map[SETTING_KEYS.OT_MULTIPLIER] || DEFAULT_ATTENDANCE.otMultiplier,
    });
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (vals: AttendanceSettingsValues) =>
      Promise.all([
        upsertSystemSetting(SETTING_KEYS.ATTENDANCE_LATE_GRACE_MINUTES, vals.lateGrace),
        upsertSystemSetting(
          SETTING_KEYS.ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES,
          vals.earlyLeaveGrace,
        ),
        upsertSystemSetting(SETTING_KEYS.PUNCH_COOLDOWN_MINUTES, vals.punchCooldown),
        upsertSystemSetting(SETTING_KEYS.OT_AFTER_MINUTES, vals.otAfter),
        upsertSystemSetting(SETTING_KEYS.OT_MULTIPLIER, vals.otMultiplier),
      ]),
    onSuccess: () => {
      setNotice('Đã lưu quy tắc chấm công');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Lưu quy tắc chấm công thất bại'),
  });

  const loading = settingsQuery.isLoading;
  const displayError =
    error ??
    (settingsQuery.error instanceof ApiError
      ? settingsQuery.error.message
      : settingsQuery.error
        ? 'Không tải được cài đặt'
        : null);

  return (
    <QueryBoundary
      isLoading={loading}
      error={displayError}
      onRetry={() => void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() })}
    >
      {notice && (
        <p className="mb-4 rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          {notice}
        </p>
      )}
      <SettingsAttendancePanel
        values={values}
        saving={saveMutation.isPending}
        loading={loading}
        onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
        onSave={() => {
          setNotice(null);
          setError(null);
          saveMutation.mutate(values);
        }}
      />
    </QueryBoundary>
  );
}

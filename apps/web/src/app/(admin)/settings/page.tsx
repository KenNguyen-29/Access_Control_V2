'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageShell } from '@/components/design/PageShell';
import { Select } from '@/components/ui/select';
import { QueryBoundary } from '@/components/ui/query-states';
import { SettingsSidebar } from '@/components/settings/SettingsSidebar';
import { SettingsGeneralPanel } from '@/components/settings/SettingsGeneralPanel';
import { SettingsLinkGrid } from '@/components/settings/SettingsLinkGrid';
import { SettingsDataPanel } from '@/components/settings/SettingsDataPanel';
import { SettingsAttendancePanel } from '@/components/settings/SettingsAttendancePanel';
import { SettingsMonitoringPanel } from '@/components/settings/SettingsMonitoringPanel';
import { SettingsIntegrationPanel } from '@/components/settings/SettingsIntegrationPanel';
import {
  getSectionLinks,
  SETTINGS_NAV,
  SETTING_KEYS,
  type SettingsSectionId,
} from '@/lib/settingsCatalog';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  getIntegrationStatus,
  getSystemSettings,
  upsertSystemSetting,
} from '@/lib/api';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');
  const [dateFormat, setDateFormat] = useState('dd/MM/yyyy');
  const [autoLogout, setAutoLogout] = useState(false);
  const [attendance, setAttendance] = useState({
    lateGrace: '5',
    earlyLeaveGrace: '5',
    punchCooldown: '5',
    otAfter: '0',
    otMultiplier: '1.25',
  });
  const [monitoring, setMonitoring] = useState({
    layout: '4',
    popupTimeoutMs: '6000',
    alertSound: false,
  });
  const [integration, setIntegration] = useState({
    webhookToken: '',
    allowedIps: '',
    mockMode: false,
    monitorPushUrl: '',
    monitorPushSecret: '',
    monitorPushEnabled: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: queryKeys.systemSettings(),
    queryFn: () => getSystemSettings(),
  });
  const integrationQuery = useQuery({
    queryKey: queryKeys.integrationStatus(),
    queryFn: () => getIntegrationStatus(),
    enabled: activeSection === 'integration',
  });

  const loading = settingsQuery.isLoading;
  const displayError =
    error ??
    (settingsQuery.error instanceof ApiError
      ? settingsQuery.error.message
      : settingsQuery.error
        ? 'Không tải được cài đặt'
        : null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const map = Object.fromEntries(settingsQuery.data.map((s) => [s.key, s.value]));
    setDateFormat(map[SETTING_KEYS.DATE_FORMAT] || 'dd/MM/yyyy');
    setAutoLogout(map[SETTING_KEYS.AUTO_LOGOUT_ENABLED] === 'true');
    setAttendance({
      lateGrace: map[SETTING_KEYS.ATTENDANCE_LATE_GRACE_MINUTES] || '5',
      earlyLeaveGrace: map[SETTING_KEYS.ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES] || '5',
      punchCooldown: map[SETTING_KEYS.PUNCH_COOLDOWN_MINUTES] || '5',
      otAfter: map[SETTING_KEYS.OT_AFTER_MINUTES] || '0',
      otMultiplier: map[SETTING_KEYS.OT_MULTIPLIER] || '1.25',
    });
    setMonitoring({
      layout: map[SETTING_KEYS.CAMERA_DEFAULT_LAYOUT] || '4',
      popupTimeoutMs: map[SETTING_KEYS.CHECKIN_POPUP_TIMEOUT_MS] || '6000',
      alertSound: map[SETTING_KEYS.ALERT_SOUND_ENABLED] === 'true',
    });
    setIntegration({
      webhookToken: map[SETTING_KEYS.AKUVOX_WEBHOOK_TOKEN] || '',
      allowedIps: map[SETTING_KEYS.AKUVOX_ALLOWED_IPS] || '',
      mockMode: map[SETTING_KEYS.AKUVOX_MOCK_MODE] === 'true',
      monitorPushUrl: map[SETTING_KEYS.MONITOR_PUSH_URL] || '',
      monitorPushSecret: map[SETTING_KEYS.MONITOR_PUSH_SECRET] || '',
      monitorPushEnabled: map[SETTING_KEYS.MONITOR_PUSH_ENABLED] === 'true',
    });
  }, [settingsQuery.data]);

  function loadSettings() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
  }

  const saveGeneral = useMutation({
    mutationFn: (vals: { dateFormat: string; autoLogout: boolean }) =>
      Promise.all([
        upsertSystemSetting(SETTING_KEYS.DATE_FORMAT, vals.dateFormat),
        upsertSystemSetting(SETTING_KEYS.AUTO_LOGOUT_ENABLED, String(vals.autoLogout)),
      ]),
    onSuccess: (_res, vals) => {
      localStorage.setItem('autoLogoutEnabled', String(vals.autoLogout));
      setNotice('Đã lưu cài đặt chung');
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const resetGeneral = useMutation({
    mutationFn: () =>
      Promise.all([
        upsertSystemSetting(SETTING_KEYS.DATE_FORMAT, 'dd/MM/yyyy'),
        upsertSystemSetting(SETTING_KEYS.AUTO_LOGOUT_ENABLED, 'false'),
      ]),
    onSuccess: () => {
      localStorage.removeItem('autoLogoutEnabled');
      setNotice('Đã khôi phục mặc định');
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Khôi phục thất bại'),
  });

  const saveAttendance = useMutation({
    mutationFn: () =>
      Promise.all([
        upsertSystemSetting(SETTING_KEYS.ATTENDANCE_LATE_GRACE_MINUTES, attendance.lateGrace),
        upsertSystemSetting(
          SETTING_KEYS.ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES,
          attendance.earlyLeaveGrace,
        ),
        upsertSystemSetting(SETTING_KEYS.PUNCH_COOLDOWN_MINUTES, attendance.punchCooldown),
        upsertSystemSetting(SETTING_KEYS.OT_AFTER_MINUTES, attendance.otAfter),
        upsertSystemSetting(SETTING_KEYS.OT_MULTIPLIER, attendance.otMultiplier),
      ]),
    onSuccess: () => {
      setNotice('Đã lưu quy tắc chấm công');
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const saveMonitoring = useMutation({
    mutationFn: () =>
      Promise.all([
        upsertSystemSetting(SETTING_KEYS.CAMERA_DEFAULT_LAYOUT, monitoring.layout),
        upsertSystemSetting(SETTING_KEYS.CHECKIN_POPUP_TIMEOUT_MS, monitoring.popupTimeoutMs),
        upsertSystemSetting(SETTING_KEYS.ALERT_SOUND_ENABLED, String(monitoring.alertSound)),
      ]),
    onSuccess: () => {
      setNotice('Đã lưu cài đặt giám sát');
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const saveIntegration = useMutation({
    mutationFn: async () => {
      const ops: Promise<unknown>[] = [
        upsertSystemSetting(SETTING_KEYS.AKUVOX_ALLOWED_IPS, integration.allowedIps),
        upsertSystemSetting(SETTING_KEYS.AKUVOX_MOCK_MODE, String(integration.mockMode)),
        upsertSystemSetting(SETTING_KEYS.MONITOR_PUSH_URL, integration.monitorPushUrl),
        upsertSystemSetting(
          SETTING_KEYS.MONITOR_PUSH_ENABLED,
          String(integration.monitorPushEnabled),
        ),
      ];
      const token = integration.webhookToken.trim();
      if (token && !token.startsWith('****')) {
        ops.push(upsertSystemSetting(SETTING_KEYS.AKUVOX_WEBHOOK_TOKEN, token));
      }
      const secret = integration.monitorPushSecret.trim();
      if (secret && !secret.startsWith('****')) {
        ops.push(upsertSystemSetting(SETTING_KEYS.MONITOR_PUSH_SECRET, secret));
      }
      await Promise.all(ops);
    },
    onSuccess: () => {
      setNotice('Đã lưu cấu hình tích hợp');
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrationStatus() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });

  const saving =
    saveGeneral.isPending ||
    resetGeneral.isPending ||
    saveAttendance.isPending ||
    saveMonitoring.isPending ||
    saveIntegration.isPending;

  function renderSectionContent() {
    if (activeSection === 'general') {
      return (
        <QueryBoundary isLoading={loading} error={displayError} onRetry={() => loadSettings()}>
          {notice && (
            <p className="mb-4 rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
              {notice}
            </p>
          )}
          <SettingsGeneralPanel
            dateFormat={dateFormat}
            autoLogout={autoLogout}
            saving={saving}
            loading={loading}
            onDateFormatChange={setDateFormat}
            onAutoLogoutChange={setAutoLogout}
            onSave={() => {
              setNotice(null);
              setError(null);
              saveGeneral.mutate({ dateFormat, autoLogout });
            }}
            onReset={() => {
              setDateFormat('dd/MM/yyyy');
              setAutoLogout(false);
              setNotice(null);
              setError(null);
              resetGeneral.mutate();
            }}
          />
        </QueryBoundary>
      );
    }

    if (activeSection === 'attendance') {
      return (
        <QueryBoundary isLoading={loading} error={displayError} onRetry={() => loadSettings()}>
          {notice && (
            <p className="mb-4 rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          <SettingsAttendancePanel
            values={attendance}
            saving={saving}
            loading={loading}
            onChange={(patch) => setAttendance((prev) => ({ ...prev, ...patch }))}
            onSave={() => {
              setNotice(null);
              setError(null);
              saveAttendance.mutate();
            }}
          />
        </QueryBoundary>
      );
    }

    if (activeSection === 'monitoring') {
      return (
        <QueryBoundary isLoading={loading} error={displayError} onRetry={() => loadSettings()}>
          {notice && (
            <p className="mb-4 rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          <SettingsMonitoringPanel
            values={monitoring}
            saving={saving}
            loading={loading}
            onChange={(patch) => setMonitoring((prev) => ({ ...prev, ...patch }))}
            onSave={() => {
              setNotice(null);
              setError(null);
              saveMonitoring.mutate();
            }}
          />
        </QueryBoundary>
      );
    }

    if (activeSection === 'integration') {
      return (
        <QueryBoundary isLoading={loading} error={displayError} onRetry={() => loadSettings()}>
          {notice && (
            <p className="mb-4 rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          <SettingsIntegrationPanel
            values={integration}
            status={integrationQuery.data ?? null}
            saving={saving}
            loading={loading || integrationQuery.isLoading}
            onChange={(patch) => setIntegration((prev) => ({ ...prev, ...patch }))}
            onSave={() => {
              setNotice(null);
              setError(null);
              saveIntegration.mutate();
            }}
            onRefreshStatus={() =>
              void queryClient.invalidateQueries({ queryKey: queryKeys.integrationStatus() })
            }
          />
        </QueryBoundary>
      );
    }

    if (activeSection === 'data') {
      return <SettingsDataPanel linkItems={getSectionLinks('data')} />;
    }

    return <SettingsLinkGrid items={getSectionLinks(activeSection)} />;
  }

  const sectionLabel = SETTINGS_NAV.find((s) => s.id === activeSection)?.label ?? 'Chung';

  return (
    <PageShell
      title="Cài đặt"
      subtitle="Cấu hình hệ thống, tích hợp, chấm công, giám sát và lưu trữ"
      badge="Settings"
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="shrink-0 md:hidden">
          <Select
            className="h-10 w-full"
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value as SettingsSectionId)}
          >
            {SETTINGS_NAV.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-h-[480px] flex-1 overflow-hidden rounded-sm border border-border bg-surface">
          <SettingsSidebar active={activeSection} onChange={setActiveSection} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-foreground">{sectionLabel}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">{renderSectionContent()}</div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

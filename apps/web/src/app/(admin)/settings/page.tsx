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
import {
  getSectionLinks,
  SETTINGS_NAV,
  SETTING_KEYS,
  type SettingsSectionId,
} from '@/lib/settingsCatalog';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  getSystemSettings,
  upsertSystemSetting,
} from '@/lib/api';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');
  const [dateFormat, setDateFormat] = useState('dd/MM/yyyy');
  const [autoLogout, setAutoLogout] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        ? 'Không tải được cài đặt'
        : null);

  // Hydrate the general-panel form once settings arrive.
  useEffect(() => {
    if (!settingsQuery.data) return;
    const map = Object.fromEntries(settingsQuery.data.map((s) => [s.key, s.value]));
    setDateFormat(map[SETTING_KEYS.DATE_FORMAT] || 'dd/MM/yyyy');
    setAutoLogout(map[SETTING_KEYS.AUTO_LOGOUT_ENABLED] === 'true');
  }, [settingsQuery.data]);

  function loadSettings() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings() });
  }

  const saveMutation = useMutation({
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

  function handleSave() {
    setNotice(null);
    setError(null);
    saveMutation.mutate({ dateFormat, autoLogout });
  }

  const resetMutation = useMutation({
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
  const saving = saveMutation.isPending || resetMutation.isPending;

  function handleReset() {
    setDateFormat('dd/MM/yyyy');
    setAutoLogout(false);
    setNotice(null);
    setError(null);
    resetMutation.mutate();
  }

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
            onSave={() => void handleSave()}
            onReset={() => void handleReset()}
          />
        </QueryBoundary>
      );
    }

    if (activeSection === 'data') {
      return <SettingsDataPanel linkItems={getSectionLinks('data')} />;
    }

    return <SettingsLinkGrid items={getSectionLinks(activeSection)} />;
  }

  const sectionLabel =
    SETTINGS_NAV.find((s) => s.id === activeSection)?.label ?? 'Chung';

  return (
    <PageShell
      title="Cài đặt"
      subtitle="Cấu hình hệ thống, nhân sự, ra vào và lưu trữ"
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

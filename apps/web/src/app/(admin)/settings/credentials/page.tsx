'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageShell, DesignCard } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  getCredentialsList,
  getDevices,
  revokeCredential,
  syncDeviceCredentials,
  type CredentialRow,
} from '@/lib/api';

const TYPE_LABELS: Record<string, string> = {
  FACE_ID: 'FaceID',
  FACE: 'FaceID',
  QR_CODE: 'QR',
  RFID_CARD: 'RFID',
  CARD: 'RFID',
};

const DEVICES_PARAMS = { page: 1, pageSize: 100 } as const;

export default function CredentialsSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('active');
  const [syncDeviceId, setSyncDeviceId] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials(statusFilter === 'all' ? undefined : statusFilter),
    queryFn: () => getCredentialsList(statusFilter === 'all' ? undefined : statusFilter),
  });
  const devicesQuery = useQuery({
    queryKey: queryKeys.devices(DEVICES_PARAMS),
    queryFn: () => getDevices(DEVICES_PARAMS),
  });

  const items = credentialsQuery.data ?? [];
  const devices = useMemo(
    () =>
      (devicesQuery.data?.items ?? []).filter(
        (d) => d.deviceType === 'AKUVOX' || d.deviceType === 'DNAKE',
      ),
    [devicesQuery.data],
  );
  const loading = credentialsQuery.isLoading || devicesQuery.isLoading;
  const queryError = credentialsQuery.error ?? devicesQuery.error;
  const displayError =
    error ??
    (queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Không tải được credentials'
        : null);

  useEffect(() => {
    setSyncDeviceId((prev) => prev || devices[0]?.id || '');
  }, [devices]);

  function load() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['credentials'] });
    void queryClient.invalidateQueries({ queryKey: ['devices'] });
  }

  const revokeMutation = useMutation({
    mutationFn: (cred: CredentialRow) => revokeCredential(cred.id),
    onSuccess: () => {
      setNotice('Đã thu hồi credential');
      void queryClient.invalidateQueries({ queryKey: ['credentials'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Thu hồi thất bại'),
  });

  function handleRevoke(cred: CredentialRow) {
    if (!confirm(`Thu hồi credential của ${cred.user?.fullName ?? cred.userId}?`)) return;
    setError(null);
    setNotice(null);
    revokeMutation.mutate(cred);
  }

  async function handleSyncDevice() {
    if (!syncDeviceId) {
      setError('Chọn thiết bị đích để đồng bộ');
      return;
    }
    setSyncingId(syncDeviceId);
    setError(null);
    setNotice(null);
    try {
      const res = await syncDeviceCredentials(syncDeviceId);
      setNotice(`Đã đồng bộ ${res.synced} credential lên thiết bị`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Đồng bộ thất bại');
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <PageShell
      title="Thông tin đăng nhập"
      subtitle="Quản lý FaceID / thẻ — thu hồi hoặc đồng bộ lên thiết bị Akuvox"
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

      <DesignCard title="Bộ lọc & đồng bộ">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Trạng thái</label>
            <Select
              className="w-40"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'active' | 'revoked')
              }
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang dùng</option>
              <option value="revoked">Đã thu hồi</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Thiết bị đồng bộ</label>
            <Select
              className="w-56"
              value={syncDeviceId}
              onChange={(e) => setSyncDeviceId(e.target.value)}
            >
              <option value="">Chọn thiết bị</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!syncDeviceId || !!syncingId}
            onClick={() => void handleSyncDevice()}
          >
            <Upload className="h-4 w-4" />
            {syncingId ? 'Đang đồng bộ...' : 'Đồng bộ thiết bị'}
          </Button>
        </div>
      </DesignCard>

      <QueryBoundary
        isLoading={loading}
        error={displayError}
        onRetry={() => load()}
        isEmpty={!loading && items.length === 0}
        emptyTitle="Không có credential"
        emptyDescription="Chưa có thông tin đăng nhập theo bộ lọc hiện tại."
      >
        <DesignCard title="Danh sách credentials">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Nhân viên</th>
                  <th className="px-3 py-2 font-semibold">Loại</th>
                  <th className="px-3 py-2 font-semibold">Trạng thái</th>
                  <th className="px-3 py-2 font-semibold">Sync</th>
                  <th className="px-3 py-2 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="px-3 py-2">
                      <p className="font-medium">{c.user?.fullName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.user?.employeeCode ?? c.userId}
                      </p>
                    </td>
                    <td className="px-3 py-2">{TYPE_LABELS[c.type] ?? c.type}</td>
                    <td className="px-3 py-2">
                      <Badge variant={c.isActive ? 'default' : 'secondary'}>
                        {c.isActive ? 'Active' : 'Revoked'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.syncStatus}</td>
                    <td className="px-3 py-2 text-right">
                      {c.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(c)}
                          title="Thu hồi"
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                          Thu hồi
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DesignCard>
      </QueryBoundary>
    </PageShell>
  );
}

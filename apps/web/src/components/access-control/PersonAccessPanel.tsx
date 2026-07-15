'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, Search, User as UserIcon } from 'lucide-react';
import { Collapsible } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { QueryBoundary } from '@/components/ui/query-states';
import { UserInfiniteList } from '@/components/users/UserInfiniteList';
import { ZoneAccessCard } from '@/components/access-control/ZoneAccessCard';
import { AccessSyncReportPanel } from '@/components/access-control/AccessSyncReport';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  createPermission,
  deletePermission,
  getAccessZones,
  getDepartments,
  getUserAccessSummary,
  type User,
  type UserAccessSummary,
} from '@/lib/api';
import { syncUserToZoneDevices, type AccessSyncReport } from '@/lib/accessSync';
import { cn } from '@/lib/utils';

export function PersonAccessPanel() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserAccessSummary | null>(null);
  const [allZones, setAllZones] = useState<Array<{ zoneId: string; zoneName: string }>>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [deptFilter, setDeptFilter] = useState('all');
  const [addZoneId, setAddZoneId] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncReport, setSyncReport] = useState<AccessSyncReport | null>(null);

  const departmentId = deptFilter === 'all' ? undefined : deptFilter;

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments(),
  });

  const loadZones = useCallback(async () => {
    setZonesLoading(true);
    setError(null);
    try {
      const zones = await getAccessZones();
      setAllZones(zones.map((z) => ({ zoneId: z.id, zoneName: z.name })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu');
    } finally {
      setZonesLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const data = await getUserAccessSummary(userId);
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được phân quyền');
      setSummary(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadZones();
  }, [loadZones]);

  useEffect(() => {
    if (selectedUserId) {
      void loadSummary(selectedUserId);
      setSyncReport(null);
      setNotice(null);
    } else {
      setSummary(null);
    }
  }, [selectedUserId, loadSummary]);

  const departments = departmentsQuery.data ?? [];

  const availableZones = useMemo(() => {
    const granted = new Set(summary?.zones.map((z) => z.zoneId) ?? []);
    return allZones.filter((z) => !granted.has(z.zoneId));
  }, [allZones, summary]);

  const credentialSummary = useMemo(() => {
    if (!summary) return '';
    const types = summary.credentials.map((c) => {
      if (c.type === 'FACE') return 'FaceID';
      if (c.type === 'QR_CODE') return 'Mã PIN/QR';
      if (c.type === 'RFID_CARD') return 'Thẻ từ';
      return c.type;
    });
    const doorCount = summary.zones.reduce((n, z) => n + z.devices.length, 0);
    const credPart = types.length ? types.join(' · ') : 'Chưa có credential';
    return `${credPart} | ${doorCount} cửa`;
  }, [summary]);

  const handleAddZone = async () => {
    if (!selectedUserId || !addZoneId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createPermission({ userId: selectedUserId, zoneId: addZoneId });
      setNotice('Đã thêm khu vực');
      setAddZoneId('');
      await loadSummary(selectedUserId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thêm khu vực thất bại');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveZone = async (permissionId: string) => {
    if (!selectedUserId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deletePermission(permissionId);
      setNotice('Đã gỡ khu vực');
      await loadSummary(selectedUserId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gỡ khu vực thất bại');
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    if (!selectedUserId || !summary) return;
    if (summary.zones.every((z) => z.devices.length === 0)) {
      setError('Không có cửa/thiết bị để đồng bộ');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const report = await syncUserToZoneDevices(selectedUserId);
      setSyncReport(report);
      if (report.success) {
        setNotice('Đồng bộ thành công tất cả thiết bị');
      } else {
        setError('Đồng bộ một phần hoặc thất bại — xem chi tiết bên dưới');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đồng bộ thất bại');
    } finally {
      setBusy(false);
    }
  };

  const renderUserRow = (u: User) => (
    <button
      key={u.id}
      type="button"
      className={cn(
        'w-full border-b border-border/50 px-3 py-2.5 text-left text-sm hover:bg-muted/40',
        selectedUserId === u.id && 'border-l-2 border-l-primary bg-primary/5',
      )}
      onClick={() => setSelectedUserId(u.id)}
    >
      <div className="truncate font-medium">{u.fullName}</div>
      <div className="truncate text-xs text-muted-foreground">
        {u.employeeCode ?? u.id.slice(0, 8)}
        {u.department?.name ? ` · ${u.department.name}` : ''}
      </div>
    </button>
  );

  const loading = zonesLoading || departmentsQuery.isLoading;

  return (
    <QueryBoundary isLoading={loading} error={error && !allZones.length ? error : null} onRetry={loadZones}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-2">
          <Collapsible title="Hướng dẫn phân quyền" defaultOpen={false}>
            <ol className="list-decimal space-y-1 pl-4 text-xs">
              <li>Chọn nhân viên ở danh sách bên trái</li>
              <li>Thêm hoặc gỡ khu vực được cấp quyền</li>
              <li>Đồng bộ credentials xuống thiết bị Akuvox</li>
            </ol>
          </Collapsible>
        </div>

        {notice || error ? (
          <div className="shrink-0 space-y-1 border-b border-border px-4 py-2">
            {notice && <p className="text-xs text-emerald-600">{notice}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div className="flex w-72 shrink-0 flex-col border-r border-border min-h-0">
            <div className="shrink-0 space-y-2 border-b border-border p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm nhân viên..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8"
                />
              </div>
              <Select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-8 text-xs"
              >
                <option value="all">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1 overflow-y-auto">
              <UserInfiniteList
                search={debouncedSearch}
                departmentId={departmentId}
                emptyText="Không có dữ liệu"
                renderItem={renderUserRow}
              />
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
            {!selectedUserId ? (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                Chọn một nhân viên để xem phân quyền
              </div>
            ) : detailLoading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Đang tải...
              </div>
            ) : summary ? (
              <div className="max-w-2xl space-y-4 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    {summary.user.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={summary.user.photoUrl}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <UserIcon className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold">
                      {summary.user.fullName}
                      {summary.user.employeeCode && (
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          · {summary.user.employeeCode}
                        </span>
                      )}
                    </h3>
                    {summary.user.departmentName && (
                      <p className="text-xs text-muted-foreground">{summary.user.departmentName}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{credentialSummary}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Khu vực được cấp
                  </p>
                  {summary.zones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Chưa có khu vực nào</p>
                  ) : (
                    <div className="space-y-2">
                      {summary.zones.map((zone) => (
                        <ZoneAccessCard
                          key={zone.zoneId}
                          zone={zone}
                          onRemove={handleRemoveZone}
                          removing={busy}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {availableZones.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={addZoneId}
                      onChange={(e) => setAddZoneId(e.target.value)}
                      className="h-9 w-48"
                    >
                      <option value="">Chọn khu vực...</option>
                      {availableZones.map((z) => (
                        <option key={z.zoneId} value={z.zoneId}>
                          {z.zoneName}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!addZoneId || busy}
                      onClick={() => void handleAddZone()}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Thêm khu vực
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    disabled={busy || summary.zones.length === 0}
                    onClick={() => void handleSync()}
                  >
                    <RefreshCw className={cn('mr-1 h-3.5 w-3.5', busy && 'animate-spin')} />
                    Đồng bộ thiết bị
                  </Button>
                </div>

                <AccessSyncReportPanel report={syncReport} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </QueryBoundary>
  );
}

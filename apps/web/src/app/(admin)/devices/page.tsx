'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link2,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  RefreshCw,
  DoorOpen,
  RefreshCcw,
  Wifi,
  WifiOff,
  Loader2,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { DeviceTypeBadge, SyncBadge } from '@/components/ui/status-badge';
import { QueryBoundary } from '@/components/ui/query-states';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  createDevice,
  createDeviceMapping,
  deleteDevice,
  deleteDeviceMapping,
  getDeviceMappings,
  getAccessZones,
  getDevices,
  openDeviceDoor,
  syncDeviceCredentials,
  testDeviceConnection,
  updateDevice,
  type Device,
} from '@/lib/api';

const DEFAULT_RTSP_TEMPLATE = 'rtsp://192.168.1.100:554/Streaming/Channels/101';

const EMPTY_FORM = {
  name: '',
  code: '',
  deviceType: 'AKUVOX' as 'AKUVOX' | 'CAMERA',
  ipAddress: '',
  location: '',
  zoneId: '',
  rtspUrl: DEFAULT_RTSP_TEMPLATE,
  username: '',
  password: '',
};

const DEVICES_PARAMS = { page: 1, pageSize: 200 } as const;
type DevicesResult = Awaited<ReturnType<typeof getDevices>>;

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [mapForm, setMapForm] = useState({ akuvoxDeviceId: '', cameraDeviceId: '' });
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());

  const devicesQuery = useQuery({
    queryKey: queryKeys.devices(DEVICES_PARAMS),
    queryFn: () => getDevices(DEVICES_PARAMS),
  });
  const mappingsQuery = useQuery({
    queryKey: queryKeys.deviceMappings(),
    queryFn: () => getDeviceMappings(),
  });
  const zonesQuery = useQuery({
    queryKey: ['accessZones'],
    queryFn: () => getAccessZones(),
  });

  const items = useMemo(() => devicesQuery.data?.items ?? [], [devicesQuery.data]);
  const mappings = mappingsQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const zoneNameById = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones],
  );
  const loading = devicesQuery.isLoading || mappingsQuery.isLoading;
  const queryError = devicesQuery.error ?? mappingsQuery.error;
  const displayError =
    error ??
    (queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Không tải được thiết bị'
        : null);

  const akuvoxDevices = useMemo(() => items.filter((d) => d.deviceType === 'AKUVOX'), [items]);
  const cameras = useMemo(() => items.filter((d) => d.deviceType === 'CAMERA'), [items]);

  const hasActiveFilters = search.trim() !== '' || typeFilter !== 'all';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((d) => {
      if (typeFilter !== 'all' && d.deviceType !== typeFilter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.ipAddress || '').toLowerCase().includes(q) ||
        (d.location || '').toLowerCase().includes(q)
      );
    });
  }, [items, search, typeFilter]);

  function load() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['devices'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.deviceMappings() });
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(device: Device) {
    setEditing(device);
    setForm({
      name: device.name,
      code: device.code,
      deviceType: device.deviceType,
      ipAddress: device.ipAddress || '',
      location: device.location || '',
      zoneId: device.zoneId || '',
      rtspUrl: device.rtspUrl || DEFAULT_RTSP_TEMPLATE,
      username:
        (device.deviceType === 'CAMERA' ? device.rtspUsername : device.akuvoxUsername) || '',
      password: '',
    });
    setOpen(true);
  }

  async function onTest(device: Device) {
    setTestingIds((prev) => new Set(prev).add(device.id));
    try {
      const res = await testDeviceConnection(device.id);
      queryClient.setQueryData<DevicesResult>(queryKeys.devices(DEVICES_PARAMS), (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((d) =>
            d.id === device.id
              ? {
                  ...d,
                  isOnline: res.online,
                  lastHeartbeat: res.online ? res.checkedAt : d.lastHeartbeat,
                }
              : d,
          ),
        };
      });
      setNotice(
        res.online
          ? `${device.name} đang kết nối (${res.latencyMs}ms${res.mock ? ' · mock' : ''})`
          : `${device.name} mất kết nối${res.host ? ` — không tới được ${res.host}:${res.port}` : ''}`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Kiểm tra kết nối thất bại');
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const isAkuvox = form.deviceType === 'AKUVOX';
      if (isAkuvox && !form.zoneId.trim()) {
        throw new ApiError('Akuvox cần chọn khu vực', 400);
      }
      const duplicateZone = isAkuvox
        ? items.find(
            (d) =>
              d.deviceType === 'AKUVOX' &&
              d.zoneId === form.zoneId &&
              d.id !== editing?.id,
          )
        : null;
      if (duplicateZone) {
        throw new ApiError(
          `Khu vực "${zoneNameById.get(form.zoneId) ?? form.zoneId}" đã có Akuvox (${duplicateZone.name})`,
          409,
        );
      }
      const username = form.username.trim();
      const password = form.password.trim();
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        deviceType: form.deviceType,
        ipAddress: form.ipAddress.trim() || undefined,
        location: form.location.trim() || undefined,
        zoneId: isAkuvox ? form.zoneId : form.zoneId.trim() || undefined,
        rtspUrl: form.rtspUrl.trim() || undefined,
        // Credentials mapped by device type; password omitted when blank to keep existing
        ...(isAkuvox
          ? {
              username: username || undefined,
              ...(password ? { password } : {}),
            }
          : {
              rtspUsername: username || undefined,
              ...(password ? { rtspPassword: password } : {}),
            }),
      };
      return editing ? updateDevice(editing.id, payload) : createDevice(payload);
    },
    onSuccess: async (saved) => {
      setError(null);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
      // Auto-check connectivity so the status reflects immediately without a manual click.
      void onTest(saved);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Lưu thất bại'),
  });
  const saving = saveMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: (target: Device) => deleteDevice(target.id),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Xóa thất bại'),
  });
  const deleting = deleteMutation.isPending;

  const mappingMutation = useMutation({
    mutationFn: () => createDeviceMapping(mapForm),
    onSuccess: () => {
      setMapOpen(false);
      setMapForm({ akuvoxDeviceId: '', cameraDeviceId: '' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.deviceMappings() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Tạo liên kết thất bại'),
  });

  function onSave() {
    saveMutation.mutate();
  }

  function onConfirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  }

  async function onOpenDoor(device: Device) {
    try {
      await openDeviceDoor(device.id);
      setNotice(`Đã gửi lệnh mở cửa tới ${device.name}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mở cửa thất bại');
    }
  }

  async function onTestAll() {
    for (const d of filtered) {
      await onTest(d);
    }
  }

  async function onSync(device: Device) {
    try {
      const res = await syncDeviceCredentials(device.id);
      setNotice(`Đã đồng bộ ${res.synced} thông tin nhận diện cho ${device.name}`);
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Đồng bộ thất bại');
    }
  }

  function onCreateMapping() {
    mappingMutation.mutate();
  }

  async function onDeleteMapping(id: string) {
    try {
      await deleteDeviceMapping(id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.deviceMappings() });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Xóa liên kết thất bại');
    }
  }

  return (
    <PageShell
      badge="Quản trị"
      title="Quản lý Thiết bị"
      subtitle="Akuvox FaceID, camera MediaMTX và liên kết Akuvox ↔ Camera."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Làm mới
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onTestAll()}
            disabled={loading || testingIds.size > 0 || filtered.length === 0}
          >
            <Activity className={testingIds.size > 0 ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
            Kiểm tra kết nối
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMapOpen(true)}>
            <Link2 className="h-4 w-4" />
            Liên kết
          </Button>
          <Button variant="accent" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Thêm thiết bị
          </Button>
        </>
      }
    >
      {notice && (
        <div className="rounded-sm border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-foreground">
          {notice}
        </div>
      )}

      <DesignCard title="Tìm kiếm & bộ lọc">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_200px_auto]">
          <div>
            <label htmlFor="device-search" className="mb-1 block text-xs text-muted-foreground">
              Tìm kiếm
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="device-search"
                placeholder="Tên, mã, IP hoặc vị trí..."
                className="input-design h-10 pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="device-type" className="mb-1 block text-xs text-muted-foreground">
              Loại thiết bị
            </label>
            <Select id="device-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Tất cả</option>
              <option value="AKUVOX">AKUVOX</option>
              <option value="CAMERA">CAMERA</option>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 gap-1.5"
              onClick={() => {
                setSearch('');
                setTypeFilter('all');
              }}
            >
              <X className="h-4 w-4" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </DesignCard>

      <DesignCard
        title={`Danh sách thiết bị (${filtered.length})`}
        description="Akuvox FaceID và camera giám sát"
      >
        <QueryBoundary
          isLoading={loading}
          error={displayError}
          isEmpty={filtered.length === 0}
          onRetry={() => load()}
          emptyTitle={hasActiveFilters ? 'Không tìm thấy thiết bị' : 'Chưa có thiết bị'}
          emptyDescription="Thêm thiết bị Akuvox hoặc camera để bắt đầu."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-left font-semibold">Tên thiết bị</th>
                  <th className="p-3 text-left font-semibold">Mã</th>
                  <th className="p-3 text-left font-semibold">Loại</th>
                  <th className="p-3 text-left font-semibold">Khu vực</th>
                  <th className="p-3 text-left font-semibold">IP / Vị trí</th>
                  <th className="p-3 text-left font-semibold">Đồng bộ</th>
                  <th className="p-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-t border-border transition-colors hover:bg-muted/20">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <StatusDot online={d.isOnline} testing={testingIds.has(d.id)} />
                        <span className="truncate font-semibold">{d.name}</span>
                      </div>
                    </td>
                    <td className="truncate p-3 font-mono text-xs text-muted-foreground">{d.code}</td>
                    <td className="p-3">
                      <DeviceTypeBadge type={d.deviceType} />
                    </td>
                    <td className="truncate p-3 text-xs text-muted-foreground">
                      {d.zone?.name ?? (d.zoneId ? zoneNameById.get(d.zoneId) : null) ?? '—'}
                    </td>
                    <td className="truncate p-3 text-xs text-muted-foreground">
                      <span className="font-mono">{d.ipAddress || '—'}</span>
                      {d.location ? ` · ${d.location}` : ''}
                    </td>
                    <td className="p-3">
                      <SyncBadge status={d.syncStatus} />
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Kiểm tra kết nối"
                          disabled={testingIds.has(d.id)}
                          onClick={() => void onTest(d)}
                        >
                          {testingIds.has(d.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                          ) : d.isOnline ? (
                            <Wifi className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <WifiOff className="h-4 w-4 text-slate-400" />
                          )}
                        </Button>
                        {d.deviceType === 'AKUVOX' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Mở cửa"
                              onClick={() => void onOpenDoor(d)}
                            >
                              <DoorOpen className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Đồng bộ"
                              onClick={() => void onSync(d)}
                            >
                              <RefreshCcw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(d)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryBoundary>
      </DesignCard>

      <DesignCard
        title={`Liên kết Akuvox ↔ Camera (${mappings.length})`}
        description="Gắn camera giám sát với đầu đọc Akuvox để hiển thị khi có sự kiện."
      >
        <QueryBoundary
          isLoading={loading}
          isEmpty={mappings.length === 0}
          emptyTitle="Chưa có liên kết"
          emptyDescription="Tạo liên kết để camera hiển thị theo đầu đọc."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Akuvox</th>
                  <th className="p-2 font-semibold">Camera</th>
                  <th className="p-2 font-semibold">Ưu tiên</th>
                  <th className="p-2 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-2">{m.akuvoxDevice?.name || m.akuvoxDeviceId}</td>
                    <td className="p-2">{m.cameraDevice?.name || m.cameraDeviceId}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{m.priority}</td>
                    <td className="p-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => void onDeleteMapping(m.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryBoundary>
      </DesignCard>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Sửa thiết bị' : 'Thêm thiết bị'}
        description="Cấu hình thông tin thiết bị Akuvox hoặc camera."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Tên thiết bị</label>
              <Input
                placeholder="Cổng chính"
                className="input-design h-10"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Mã thiết bị</label>
              <Input
                placeholder="DEV001"
                className="input-design h-10"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Loại</label>
            <Select
              value={form.deviceType}
              onChange={(e) => setForm({ ...form, deviceType: e.target.value as 'AKUVOX' | 'CAMERA' })}
              disabled={!!editing}
            >
              <option value="AKUVOX">AKUVOX</option>
              <option value="CAMERA">CAMERA</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Khu vực {form.deviceType === 'AKUVOX' && <span className="text-destructive">*</span>}
            </label>
            <Select
              value={form.zoneId}
              onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
            >
              <option value="">
                {form.deviceType === 'AKUVOX' ? '— Chọn khu vực —' : '— Không gắn khu vực —'}
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
            {form.deviceType === 'AKUVOX' && form.zoneId && (
              <p className="mt-1 text-xs text-muted-foreground">
                Mỗi khu vực nên có một Akuvox — FaceID sẽ đồng bộ theo khu vực.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Địa chỉ IP</label>
              <Input
                placeholder="192.168.1.x"
                className="input-design h-10"
                value={form.ipAddress}
                onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Vị trí</label>
              <Input
                placeholder="Tầng 1"
                className="input-design h-10"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">RTSP URL</label>
            <Input
              placeholder={DEFAULT_RTSP_TEMPLATE}
              className="input-design h-10 font-mono text-xs"
              value={form.rtspUrl}
              onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Mẫu có sẵn — chỉ cần sửa IP (và cổng/đường dẫn nếu khác) cho đúng thiết bị.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-muted/20 p-3">
            <div className="col-span-2 -mb-1 text-xs font-semibold text-muted-foreground">
              {form.deviceType === 'AKUVOX'
                ? 'Tài khoản HTTP API (Akuvox)'
                : 'Tài khoản đăng nhập camera (RTSP)'}
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Tài khoản</label>
              <Input
                placeholder="admin"
                className="input-design h-10"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Mật khẩu</label>
              <Input
                type="password"
                placeholder={
                  (form.deviceType === 'AKUVOX' ? editing?.hasAkuvoxPassword : editing?.hasRtspPassword)
                    ? '••••• (giữ nguyên nếu để trống)'
                    : '••••••'
                }
                className="input-design h-10"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={
                saving ||
                !form.name ||
                !form.code ||
                (form.deviceType === 'AKUVOX' && !form.zoneId)
              }
              onClick={() => onSave()}
            >
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={mapOpen} onClose={() => setMapOpen(false)} title="Tạo liên kết" className="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Đầu đọc Akuvox</label>
            <Select
              value={mapForm.akuvoxDeviceId}
              onChange={(e) => setMapForm({ ...mapForm, akuvoxDeviceId: e.target.value })}
            >
              <option value="">— Chọn Akuvox —</option>
              {akuvoxDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Camera</label>
            <Select
              value={mapForm.cameraDeviceId}
              onChange={(e) => setMapForm({ ...mapForm, cameraDeviceId: e.target.value })}
            >
              <option value="">— Chọn Camera —</option>
              {cameras.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setMapOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={mappingMutation.isPending || !mapForm.akuvoxDeviceId || !mapForm.cameraDeviceId}
              onClick={() => onCreateMapping()}
            >
              Tạo liên kết
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => onConfirmDelete()}
        title="Xóa thiết bị"
        message={`Bạn có chắc muốn xóa thiết bị ${deleteTarget?.name ?? ''}?`}
        confirmLabel="Xóa"
        loading={deleting}
      />
    </PageShell>
  );
}

function StatusDot({ online, testing }: { online?: boolean; testing: boolean }) {
  if (testing) {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0" title="Đang kiểm tra...">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
      </span>
    );
  }
  if (online) {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0" title="Đang kết nối">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
      </span>
    );
  }
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300 ring-2 ring-slate-300/20"
      title="Mất kết nối"
    />
  );
}

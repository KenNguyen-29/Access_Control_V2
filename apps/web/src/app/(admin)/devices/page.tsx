'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  Radar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { FieldError, RequiredMark } from '@/components/ui/field-error';
import { DeviceTypeBadge, SyncBadge } from '@/components/ui/status-badge';
import { QueryBoundary } from '@/components/ui/query-states';
import { TablePager } from '@/components/ui/table-pager';
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
  getProjects,
  openDeviceDoor,
  scanOnvifDevices,
  syncDeviceCredentials,
  testDeviceConnection,
  updateDevice,
  type Device,
  type OnvifDiscoveryHit,
} from '@/lib/api';
import {
  clearFieldError,
  hasFormErrors,
  validateDeviceForm,
  validateDeviceMappingForm,
  type DeviceFormFieldErrors,
  type FieldErrors,
} from '@/lib/formValidation';
import { cn } from '@/lib/utils';

const DEFAULT_RTSP_TEMPLATE = 'rtsp://192.168.1.100:554/Streaming/Channels/101';

type PanelDeviceType = 'AKUVOX' | 'DNAKE' | 'CAMERA';

function isAttendancePanel(type: PanelDeviceType) {
  return type === 'AKUVOX' || type === 'DNAKE';
}

function panelUsername(device: Device) {
  if (device.deviceType === 'CAMERA') return device.rtspUsername || '';
  if (device.deviceType === 'DNAKE') return device.dnakeUsername || '';
  return device.akuvoxUsername || '';
}

function hasPanelPassword(device: Device, type: PanelDeviceType) {
  if (type === 'CAMERA') return Boolean(device.hasRtspPassword);
  if (type === 'DNAKE') return Boolean(device.hasDnakePassword);
  return Boolean(device.hasAkuvoxPassword);
}

const EMPTY_FORM = {
  name: '',
  deviceType: 'AKUVOX' as PanelDeviceType,
  ipAddress: '',
  location: '',
  zoneId: '',
  projectId: '',
  rtspUrl: DEFAULT_RTSP_TEMPLATE,
  username: '',
  password: '',
};

const PAGE_SIZE = 10;
const PICKER_PAGE_SIZE = 200;

export default function DevicesPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<DeviceFormFieldErrors>({});
  const [mapForm, setMapForm] = useState({ akuvoxDeviceId: '', cameraDeviceId: '' });
  const [mapFieldErrors, setMapFieldErrors] = useState<
    FieldErrors<'akuvoxDeviceId' | 'cameraDeviceId'>
  >({});
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [onvifOpen, setOnvifOpen] = useState(false);
  const [onvifHits, setOnvifHits] = useState<OnvifDiscoveryHit[]>([]);
  const [onvifUser, setOnvifUser] = useState('');
  const [onvifPass, setOnvifPass] = useState('');
  const [onvifScanning, setOnvifScanning] = useState(false);

  useEffect(() => {
    const zoneId = searchParams.get('zoneId');
    if (zoneId) setZoneFilter(zoneId);
  }, [searchParams]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: search.trim() || undefined,
      zoneId: zoneFilter || undefined,
      deviceType: typeFilter !== 'all' ? typeFilter : undefined,
    }),
    [page, search, zoneFilter, typeFilter],
  );

  const devicesQuery = useQuery({
    queryKey: queryKeys.devices(listParams),
    queryFn: () => getDevices(listParams),
  });
  const pickerQuery = useQuery({
    queryKey: queryKeys.devices({ page: 1, pageSize: PICKER_PAGE_SIZE, purpose: 'picker' }),
    queryFn: () => getDevices({ page: 1, pageSize: PICKER_PAGE_SIZE }),
    enabled: open || mapOpen,
  });
  const mappingsQuery = useQuery({
    queryKey: queryKeys.deviceMappings(),
    queryFn: () => getDeviceMappings(),
  });
  const zonesQuery = useQuery({
    queryKey: ['accessZones'],
    queryFn: () => getAccessZones(),
  });
  const projectsQuery = useQuery({
    queryKey: ['projects', 'devices-form'],
    queryFn: () => getProjects(),
    enabled: open,
  });

  const items = useMemo(() => devicesQuery.data?.items ?? [], [devicesQuery.data]);
  const total = devicesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, devicesQuery.data?.totalPages ?? 1);
  const currentPage = Math.min(page, totalPages);
  const pickerItems = useMemo(
    () => pickerQuery.data?.items ?? items,
    [pickerQuery.data, items],
  );
  const mappings = mappingsQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const projects = useMemo(() => {
    const raw = projectsQuery.data;
    return Array.isArray(raw) ? raw : [];
  }, [projectsQuery.data]);
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

  const readerDevices = useMemo(
    () => pickerItems.filter((d) => isAttendancePanel(d.deviceType)),
    [pickerItems],
  );
  const cameras = useMemo(
    () => pickerItems.filter((d) => d.deviceType === 'CAMERA'),
    [pickerItems],
  );

  const hasActiveFilters = search.trim() !== '' || typeFilter !== 'all' || zoneFilter !== '';

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, zoneFilter]);

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
    setFieldErrors({});
    setOpen(true);
  }

  function openEdit(device: Device) {
    setEditing(device);
    setForm({
      name: device.name,
      deviceType: device.deviceType,
      ipAddress: device.ipAddress || '',
      location: device.location || '',
      zoneId: device.zoneId || '',
      projectId: device.projectId || device.project?.id || '',
      rtspUrl: device.rtspUrl || DEFAULT_RTSP_TEMPLATE,
      username: panelUsername(device),
      password: '',
    });
    setFieldErrors({});
    setOpen(true);
  }

  function patchForm(patch: Partial<typeof EMPTY_FORM>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setFieldErrors((prev) =>
      clearFieldError(prev, Object.keys(patch) as (keyof DeviceFormFieldErrors)[]),
    );
  }

  function openMapDialog() {
    setMapForm({ akuvoxDeviceId: '', cameraDeviceId: '' });
    setMapFieldErrors({});
    setMapOpen(true);
  }

  function patchMapForm(patch: Partial<typeof mapForm>) {
    setMapForm((prev) => ({ ...prev, ...patch }));
    setMapFieldErrors((prev) =>
      clearFieldError(prev, Object.keys(patch) as ('akuvoxDeviceId' | 'cameraDeviceId')[]),
    );
  }

  async function onTest(device: Device) {
    setTestingIds((prev) => new Set(prev).add(device.id));
    try {
      const res = await testDeviceConnection(device.id);
      queryClient.setQueryData<Awaited<ReturnType<typeof getDevices>>>(
        queryKeys.devices(listParams),
        (old) => {
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
        },
      );
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
      const isPanel = isAttendancePanel(form.deviceType);
      const duplicateZone = isPanel
        ? pickerItems.find(
            (d) =>
              d.deviceType === form.deviceType &&
              d.zoneId === form.zoneId &&
              d.id !== editing?.id,
          )
        : null;
      if (duplicateZone) {
        throw new ApiError(
          `Khu vực "${zoneNameById.get(form.zoneId) ?? form.zoneId}" đã có ${form.deviceType} (${duplicateZone.name}). Mỗi máy chấm công chỉ gắn 1 khu vực.`,
          409,
        );
      }
      const username = form.username.trim();
      const password = form.password.trim();
      const payload = {
        name: form.name.trim(),
        deviceType: form.deviceType,
        ipAddress: form.ipAddress.trim() || undefined,
        location: form.location.trim() || undefined,
        zoneId: isPanel ? form.zoneId : form.zoneId.trim() || undefined,
        projectId: form.projectId.trim() || undefined,
        rtspUrl: form.rtspUrl.trim() || undefined,
        // Credentials mapped by device type; password omitted when blank to keep existing
        ...(isPanel
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
      setMapFieldErrors({});
      void queryClient.invalidateQueries({ queryKey: queryKeys.deviceMappings() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Tạo liên kết thất bại'),
  });

  function onSave() {
    const hasExistingPassword = Boolean(
      editing && hasPanelPassword(editing, form.deviceType),
    );
    const errors = validateDeviceForm({
      ...form,
      isEdit: !!editing,
      hasExistingPassword,
    });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setError('Vui lòng kiểm tra lại thông tin đã nhập');
      return;
    }
    setError(null);
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
    for (const d of items) {
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
    const errors = validateDeviceMappingForm(mapForm);
    setMapFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setError('Vui lòng kiểm tra lại thông tin đã nhập');
      return;
    }
    setError(null);
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

  async function runOnvifScan() {
    setOnvifScanning(true);
    setError(null);
    try {
      const res = await scanOnvifDevices({
        timeoutMs: 5000,
        username: onvifUser.trim() || undefined,
        password: onvifPass || undefined,
      });
      setOnvifHits(res.items);
      setNotice(
        res.count > 0
          ? `ONVIF: tìm thấy ${res.count} thiết bị`
          : 'ONVIF: không thấy thiết bị (API cần cùng LAN / host network)',
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Quét ONVIF thất bại');
    } finally {
      setOnvifScanning(false);
    }
  }

  function applyOnvifHit(hit: OnvifDiscoveryHit) {
    const rtsp = hit.rtspUrls[0] || `rtsp://${hit.ip}:554/Streaming/Channels/101`;
    const next = {
      ...(open ? form : EMPTY_FORM),
      name: (open ? form.name.trim() : '') || hit.name || hit.ip,
      ipAddress: hit.ip,
      rtspUrl: rtsp,
      username: onvifUser.trim() || (open ? form.username : ''),
      password: onvifPass || (open ? form.password : ''),
    };
    setForm(next);
    setFieldErrors({});
    if (!open) {
      setEditing(null);
      setOpen(true);
    }
    setOnvifOpen(false);
    setNotice(`Đã điền ${hit.ip} + RTSP từ ONVIF`);
  }

  return (
    <PageShell
      badge="Quản trị"
      title="Quản lý Thiết bị"
      subtitle="Akuvox / DNAKE FaceID, camera và liên kết đầu đọc ↔ Camera."
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
            disabled={loading || testingIds.size > 0 || items.length === 0}
          >
            <Activity className={testingIds.size > 0 ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
            Kiểm tra kết nối
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOnvifHits([]);
              setOnvifOpen(true);
            }}
          >
            <Radar className="h-4 w-4" />
            Quét ONVIF
          </Button>
          <Button variant="outline" size="sm" onClick={openMapDialog}>
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
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_160px_1fr_auto]">
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
              <option value="DNAKE">DNAKE</option>
              <option value="CAMERA">CAMERA</option>
            </Select>
          </div>
          <div>
            <label htmlFor="device-zone" className="mb-1 block text-xs text-muted-foreground">
              Công trường / khu vực
            </label>
            <Select id="device-zone" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
              <option value="">Tất cả công trường</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
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
                setZoneFilter('');
              }}
            >
              <X className="h-4 w-4" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </DesignCard>

      <DesignCard
        title={`Danh sách thiết bị (${total})`}
        description="Akuvox / DNAKE FaceID và camera giám sát"
      >
        <QueryBoundary
          isLoading={loading}
          error={displayError}
          isEmpty={items.length === 0}
          onRetry={() => load()}
          emptyTitle={hasActiveFilters ? 'Không tìm thấy thiết bị' : 'Chưa có thiết bị'}
          emptyDescription="Thêm thiết bị Akuvox, DNAKE hoặc camera để bắt đầu."
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
                  <th className="p-3 text-left font-semibold">Khu vực / Dự án</th>
                  <th className="p-3 text-left font-semibold">IP / Vị trí</th>
                  <th className="p-3 text-left font-semibold">Đồng bộ</th>
                  <th className="p-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
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
                      <div>
                        {d.zone?.name ?? (d.zoneId ? zoneNameById.get(d.zoneId) : null) ?? '—'}
                      </div>
                      {d.project?.name && (
                        <div className="mt-0.5 text-[11px] text-primary/80">{d.project.name}</div>
                      )}
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
                        {isAttendancePanel(d.deviceType) && (
                          <>
                            {d.deviceType === 'AKUVOX' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Mở cửa"
                                onClick={() => void onOpenDoor(d)}
                              >
                                <DoorOpen className="h-4 w-4" />
                              </Button>
                            )}
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
          <TablePager
            currentPage={currentPage}
            totalPages={totalPages}
            total={total}
            unit="thiết bị"
            onPageChange={setPage}
          />
        </QueryBoundary>
      </DesignCard>

      <DesignCard
        title={`Liên kết đầu đọc ↔ Camera (${mappings.length})`}
        description="Tùy chọn: gắn camera phụ. Ảnh lúc quét mặt lấy từ chính máy DNAKE/Akuvox, không bắt buộc liên kết này."
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
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Tên thiết bị
              <RequiredMark />
            </label>
            <Input
              placeholder="Cổng chính"
              className={cn('input-design h-10', fieldErrors.name && 'border-destructive')}
              value={form.name}
              onChange={(e) => patchForm({ name: e.target.value })}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Loại</label>
            <Select
              value={form.deviceType}
              onChange={(e) =>
                patchForm({ deviceType: e.target.value as PanelDeviceType })
              }
              disabled={!!editing}
            >
              <option value="AKUVOX">AKUVOX</option>
              <option value="DNAKE">DNAKE</option>
              <option value="CAMERA">CAMERA</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Khu vực
              {isAttendancePanel(form.deviceType) && <RequiredMark />}
            </label>
            <Select
              value={form.zoneId}
              onChange={(e) => patchForm({ zoneId: e.target.value })}
              className={cn(fieldErrors.zoneId && 'border-destructive')}
              aria-invalid={Boolean(fieldErrors.zoneId)}
            >
              <option value="">
                {isAttendancePanel(form.deviceType)
                  ? '— Chọn khu vực —'
                  : '— Không gắn khu vực —'}
              </option>
              {zones.map((z) => {
                const takenBy = isAttendancePanel(form.deviceType)
                  ? pickerItems.find(
                      (d) =>
                        d.deviceType === form.deviceType &&
                        d.zoneId === z.id &&
                        d.id !== editing?.id,
                    )
                  : null;
                return (
                  <option key={z.id} value={z.id} disabled={Boolean(takenBy)}>
                    {z.name}
                    {takenBy ? ` — đã có ${form.deviceType} (${takenBy.name})` : ''}
                  </option>
                );
              })}
            </Select>
            <FieldError message={fieldErrors.zoneId} />
            {isAttendancePanel(form.deviceType) && (
              <p className="mt-1 text-xs text-muted-foreground">
                Mỗi máy chấm công chỉ gắn 1 khu vực. Mỗi khu vực chỉ 1 máy {form.deviceType}.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Dự án
              {form.deviceType === 'CAMERA' && <RequiredMark />}
            </label>
            <Select
              value={form.projectId}
              onChange={(e) => patchForm({ projectId: e.target.value })}
              className={cn(fieldErrors.projectId && 'border-destructive')}
              aria-invalid={Boolean(fieldErrors.projectId)}
            >
              <option value="">
                {form.deviceType === 'CAMERA' ? '— Chọn dự án —' : '— Không gắn dự án —'}
              </option>
              {projects.filter(Boolean).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.projectId} />
            {form.deviceType === 'CAMERA' && (
              <p className="mt-1 text-xs text-muted-foreground">
                Tài khoản gắn dự án chỉ xem được camera của dự án đó trên Giám sát.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Địa chỉ IP
                <RequiredMark />
              </label>
              <Input
                placeholder="192.168.1.x"
                className={cn('input-design h-10', fieldErrors.ipAddress && 'border-destructive')}
                value={form.ipAddress}
                onChange={(e) => patchForm({ ipAddress: e.target.value })}
                aria-invalid={Boolean(fieldErrors.ipAddress)}
              />
              <FieldError message={fieldErrors.ipAddress} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Vị trí</label>
              <Input
                placeholder="Tầng 1"
                className="input-design h-10"
                value={form.location}
                onChange={(e) => patchForm({ location: e.target.value })}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-xs text-muted-foreground">
                RTSP URL
                {form.deviceType === 'CAMERA' && <RequiredMark />}
              </label>
              <button
                type="button"
                className="text-[11px] font-semibold text-primary hover:underline"
                onClick={() => {
                  setOnvifHits([]);
                  setOnvifOpen(true);
                }}
              >
                Quét ONVIF…
              </button>
            </div>
            <Input
              placeholder={DEFAULT_RTSP_TEMPLATE}
              className={cn(
                'input-design h-10 font-mono text-xs',
                fieldErrors.rtspUrl && 'border-destructive',
              )}
              value={form.rtspUrl}
              onChange={(e) => patchForm({ rtspUrl: e.target.value })}
              aria-invalid={Boolean(fieldErrors.rtspUrl)}
            />
            <FieldError message={fieldErrors.rtspUrl} />
            <p className="mt-1 text-xs text-muted-foreground">
              {form.deviceType === 'CAMERA'
                ? 'Mẫu có sẵn — chỉ cần sửa IP (và cổng/đường dẫn nếu khác) cho đúng camera.'
                : 'Dùng để xem live và chụp ảnh lúc chấm. Để trống thì thử RTSP mặc định theo IP; nên điền đúng hoặc Quét ONVIF.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-muted/20 p-3">
            <div className="col-span-2 -mb-1 text-xs font-semibold text-muted-foreground">
              {form.deviceType === 'AKUVOX'
                ? 'Tài khoản HTTP API (Akuvox)'
                : form.deviceType === 'DNAKE'
                  ? 'Tài khoản HTTP API (DNAKE)'
                  : 'Tài khoản đăng nhập camera (RTSP)'}
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Tài khoản
                <RequiredMark />
              </label>
              <Input
                placeholder="admin"
                className={cn('input-design h-10', fieldErrors.username && 'border-destructive')}
                value={form.username}
                onChange={(e) => patchForm({ username: e.target.value })}
                aria-invalid={Boolean(fieldErrors.username)}
              />
              <FieldError message={fieldErrors.username} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Mật khẩu
                {(!editing || !hasPanelPassword(editing, form.deviceType)) && <RequiredMark />}
              </label>
              <Input
                type="password"
                placeholder={
                  editing && hasPanelPassword(editing, form.deviceType)
                    ? '••••• (giữ nguyên nếu để trống)'
                    : '••••••'
                }
                className={cn('input-design h-10', fieldErrors.password && 'border-destructive')}
                value={form.password}
                onChange={(e) => patchForm({ password: e.target.value })}
                aria-invalid={Boolean(fieldErrors.password)}
              />
              <FieldError message={fieldErrors.password} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button variant="accent" size="sm" disabled={saving} onClick={() => onSave()}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={onvifOpen}
        onClose={() => setOnvifOpen(false)}
        title="Quét ONVIF"
        description="Tìm IP và gợi ý link RTSP trên LAN (WS-Discovery)."
        className="max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            API phải cùng mạng LAN với thiết bị. Nhập user/pass ONVIF (nếu có) để lấy đúng URI stream.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">User ONVIF (tuỳ chọn)</label>
              <Input
                className="input-design h-10"
                value={onvifUser}
                onChange={(e) => setOnvifUser(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Mật khẩu (tuỳ chọn)</label>
              <Input
                type="password"
                className="input-design h-10"
                value={onvifPass}
                onChange={(e) => setOnvifPass(e.target.value)}
                placeholder="••••••"
              />
            </div>
          </div>
          <Button
            variant="accent"
            size="sm"
            className="w-full"
            disabled={onvifScanning}
            onClick={() => void runOnvifScan()}
          >
            {onvifScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {onvifScanning ? 'Đang quét…' : 'Bắt đầu quét'}
          </Button>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {onvifHits.length === 0 && !onvifScanning && (
              <p className="text-center text-sm text-muted-foreground">Chưa có kết quả</p>
            )}
            {onvifHits.map((hit) => (
              <button
                key={hit.ip}
                type="button"
                className="flex w-full flex-col gap-0.5 rounded-sm border border-border bg-surface px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5"
                onClick={() => applyOnvifHit(hit)}
              >
                <span className="text-sm font-semibold text-foreground">
                  {hit.name || hit.ip}
                  <span className="ml-2 font-mono text-xs text-primary">{hit.ip}</span>
                </span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {hit.rtspUrls[0] || '—'}
                </span>
                {(hit.manufacturer || hit.model) && (
                  <span className="text-[11px] text-muted-foreground">
                    {[hit.manufacturer, hit.model].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOnvifOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={mapOpen} onClose={() => setMapOpen(false)} title="Tạo liên kết" className="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Đầu đọc (Akuvox / DNAKE)
              <RequiredMark />
            </label>
            <Select
              value={mapForm.akuvoxDeviceId}
              onChange={(e) => patchMapForm({ akuvoxDeviceId: e.target.value })}
              className={cn(mapFieldErrors.akuvoxDeviceId && 'border-destructive')}
              aria-invalid={Boolean(mapFieldErrors.akuvoxDeviceId)}
            >
              <option value="">— Chọn đầu đọc —</option>
              {readerDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.deviceType})
                </option>
              ))}
            </Select>
            <FieldError message={mapFieldErrors.akuvoxDeviceId} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Camera
              <RequiredMark />
            </label>
            <Select
              value={mapForm.cameraDeviceId}
              onChange={(e) => patchMapForm({ cameraDeviceId: e.target.value })}
              className={cn(mapFieldErrors.cameraDeviceId && 'border-destructive')}
              aria-invalid={Boolean(mapFieldErrors.cameraDeviceId)}
            >
              <option value="">— Chọn Camera —</option>
              {cameras.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <FieldError message={mapFieldErrors.cameraDeviceId} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setMapOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={mappingMutation.isPending}
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
        message={`Bạn có chắc muốn xóa hẳn thiết bị ${deleteTarget?.name ?? ''}? Mapping camera và quyền gắn máy sẽ bị xóa — không khôi phục được.`}
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

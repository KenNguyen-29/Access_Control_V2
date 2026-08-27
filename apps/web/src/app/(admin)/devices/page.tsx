'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  CheckCircle2,
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
  type OnvifProfile,
  fetchOnvifProfiles,
  testOnvifStream,
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

const RTSP_PLACEHOLDER = 'rtsp://<camera-ip>:554/<stream-path>';

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
  rtspUrl: '',
  username: '',
  password: '',
  connectionSource: 'MANUAL' as 'ONVIF' | 'MANUAL',
  onvifServiceUrl: '',
  onvifProfileToken: '',
  onvifPort: null as number | null,
  manufacturer: '',
  model: '',
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
  const [onvifHits, setOnvifHits] = useState<OnvifDiscoveryHit[]>([]);
  const [onvifScanning, setOnvifScanning] = useState(false);
  const [selectedOnvifCamera, setSelectedOnvifCamera] = useState<OnvifDiscoveryHit | null>(null);
  const [onvifProfiles, setOnvifProfiles] = useState<OnvifProfile[]>([]);
  const [onvifProfilesLoading, setOnvifProfilesLoading] = useState(false);
  const [onvifStreamTesting, setOnvifStreamTesting] = useState(false);
  const onvifRequestRef = useRef(0);

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
  const onvifIpLocked = Boolean(selectedOnvifCamera && form.connectionSource === 'ONVIF');

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
    onvifRequestRef.current += 1;
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setOnvifHits([]);
    setSelectedOnvifCamera(null);
    setOnvifProfiles([]);
    setOpen(true);
  }

  function openEdit(device: Device) {
    onvifRequestRef.current += 1;
    setEditing(device);
    setForm({
      name: device.name,
      deviceType: device.deviceType,
      ipAddress: device.ipAddress || '',
      location: device.location || '',
      zoneId: device.zoneId || '',
      projectId: device.projectId || device.project?.id || '',
      rtspUrl: device.rtspUrl || '',
      username: panelUsername(device),
      password: '',
      connectionSource: device.connectionSource === 'ONVIF' ? 'ONVIF' : 'MANUAL',
      onvifServiceUrl: device.onvifServiceUrl || '',
      onvifProfileToken: device.onvifProfileToken || '',
      onvifPort: device.onvifPort || null,
      manufacturer: device.manufacturer || '',
      model: device.model || '',
    });
    setFieldErrors({});
    setOnvifHits([]);
    setSelectedOnvifCamera(
      device.deviceType === 'CAMERA' && device.connectionSource === 'ONVIF'
        ? {
            name: device.name,
            ip: device.ipAddress || '',
            xaddrs: device.onvifServiceUrl ? [device.onvifServiceUrl] : [],
            rtspUrls: device.rtspUrl ? [device.rtspUrl] : [],
            serviceUrl: device.onvifServiceUrl || '',
            onvifPort: device.onvifPort || 80,
            manufacturer: device.manufacturer || undefined,
            model: device.model || undefined,
          }
        : null,
    );
    setOnvifProfiles([]);
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
                    lastConnectionError: res.online ? null : res.detail || d.lastConnectionError,
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
        connectionSource: form.connectionSource,
        onvifServiceUrl:
          form.connectionSource === 'ONVIF' ? form.onvifServiceUrl.trim() || undefined : undefined,
        onvifProfileToken:
          form.connectionSource === 'ONVIF' ? form.onvifProfileToken.trim() || undefined : undefined,
        onvifPort: form.connectionSource === 'ONVIF' ? form.onvifPort || undefined : undefined,
        manufacturer:
          form.connectionSource === 'ONVIF' ? form.manufacturer.trim() || undefined : undefined,
        model: form.connectionSource === 'ONVIF' ? form.model.trim() || undefined : undefined,
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
      const res = await scanOnvifDevices({ timeoutMs: 5000 });
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
    const current = form;
    const next: typeof EMPTY_FORM = {
      ...(open ? current : EMPTY_FORM),
      name: (open ? current.name.trim() : '') || hit.name || hit.ip,
      ipAddress: hit.ip,
      rtspUrl: hit.rtspUrls[0] || '',
      username: open ? current.username : '',
      password: open ? current.password : '',
      connectionSource: 'ONVIF',
      onvifServiceUrl: hit.serviceUrl,
      onvifProfileToken: hit.profiles?.[0]?.token || '',
      onvifPort: hit.onvifPort,
      manufacturer: hit.manufacturer || '',
      model: hit.model || '',
    };
    setForm(next);
    setSelectedOnvifCamera(hit);
    setOnvifProfiles(hit.profiles || []);
    setFieldErrors({});
    if (!open) {
      setEditing(null);
      setOpen(true);
    }
    setNotice(`Đã chọn thiết bị ONVIF ${hit.ip}. Đang lấy profile RTSP…`);
    void loadOnvifProfiles(next);
  }

  function changeOnvifCamera() {
    onvifRequestRef.current += 1;
    setOnvifProfilesLoading(false);
    setSelectedOnvifCamera(null);
    setOnvifProfiles([]);
    setForm((current) => ({
      ...current,
      connectionSource: 'MANUAL',
      onvifServiceUrl: '',
      onvifProfileToken: '',
      onvifPort: null,
      manufacturer: '',
      model: '',
      rtspUrl: '',
    }));
    setNotice('Đã chuyển sang nhập camera thủ công.');
  }

  function changeDeviceType(type: PanelDeviceType) {
    if (type === form.deviceType) return;
    onvifRequestRef.current += 1;
    setOnvifProfilesLoading(false);
    setSelectedOnvifCamera(null);
    setOnvifProfiles([]);
    patchForm({
      deviceType: type,
      rtspUrl: '',
      connectionSource: 'MANUAL',
      onvifServiceUrl: '',
      onvifProfileToken: '',
      onvifPort: null,
      manufacturer: '',
      model: '',
    });
    if (
      form.connectionSource === 'ONVIF' &&
      (!form.onvifServiceUrl.trim() || !form.onvifProfileToken.trim())
    ) {
      setError('Hãy lấy và chọn profile ONVIF trước khi lưu, hoặc chuyển sang nhập RTSP thủ công.');
      return;
    }
  }

  async function loadOnvifProfiles(sourceForm = form) {
    const requestId = ++onvifRequestRef.current;
    if (!sourceForm.ipAddress.trim()) {
      setOnvifProfilesLoading(false);
      return;
    }
    setOnvifProfilesLoading(true);
    setError(null);
    try {
      const result = await fetchOnvifProfiles({
        ipAddress: sourceForm.ipAddress.trim(),
        serviceUrl: sourceForm.onvifServiceUrl.trim() || undefined,
        username: sourceForm.username.trim() || undefined,
        password: sourceForm.password || undefined,
      });
      if (requestId !== onvifRequestRef.current) return;
      setSelectedOnvifCamera((current) => current || {
        name: result.name,
        ip: result.ip,
        xaddrs: result.serviceUrl ? [result.serviceUrl] : [],
        rtspUrls: result.profiles.map((profile) => profile.rtspUrl),
        serviceUrl: result.serviceUrl,
        onvifPort: result.onvifPort,
        manufacturer: result.manufacturer,
        model: result.model,
        profiles: result.profiles,
      });
      setOnvifProfiles(result.profiles);
      const first = result.profiles[0];
      setForm((current) =>
        current.ipAddress.trim() === sourceForm.ipAddress.trim()
          ? {
              ...current,
              name: result.name || current.name,
              connectionSource: 'ONVIF',
              onvifServiceUrl: result.serviceUrl || current.onvifServiceUrl,
              onvifProfileToken: first.token,
              onvifPort: result.onvifPort,
              manufacturer: result.manufacturer || current.manufacturer,
              model: result.model || current.model,
              rtspUrl: first.rtspUrl,
            }
          : current,
      );
      setNotice(`Đã lấy ${result.profiles.length} profile ONVIF từ ${result.ip}`);
    } catch (e) {
      if (requestId !== onvifRequestRef.current) return;
      setOnvifProfiles([]);
      setError(e instanceof ApiError ? e.message : 'Không lấy được profile ONVIF');
    } finally {
      if (requestId === onvifRequestRef.current) setOnvifProfilesLoading(false);
    }
  }

  function selectOnvifProfile(token: string) {
    const profile = onvifProfiles.find((item) => item.token === token);
    if (!profile) return;
    patchForm({ onvifProfileToken: token, rtspUrl: profile.rtspUrl, connectionSource: 'ONVIF' });
  }

  async function testSelectedOnvifStream() {
    if (!form.ipAddress.trim() || !form.rtspUrl.trim()) return;
    setOnvifStreamTesting(true);
    setError(null);
    try {
      const result = await testOnvifStream({
        ipAddress: form.ipAddress.trim(),
        rtspUrl: form.rtspUrl.trim(),
        username: form.username.trim() || undefined,
        password: form.password || undefined,
        timeoutMs: 7000,
      });
      if (result.online) setNotice(`${result.message} (${result.latencyMs}ms)`);
      else setError(result.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Kiểm tra luồng RTSP thất bại');
    } finally {
      setOnvifStreamTesting(false);
    }
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
                      {d.connectionSource === 'ONVIF' && (
                        <div className="mt-0.5 text-[11px] text-primary/80">
                          ONVIF{d.manufacturer || d.model ? ` · ${[d.manufacturer, d.model].filter(Boolean).join(' · ')}` : ''}
                        </div>
                      )}
                      {d.lastConnectionError && (
                        <div className="mt-0.5 truncate text-[11px] text-destructive" title={d.lastConnectionError}>
                          {d.lastConnectionError}
                        </div>
                      )}
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
        description="Cấu hình Akuvox, DNAKE hoặc camera; có thể dùng chung ONVIF để điền nhanh."
        className="flex max-h-[calc(100vh-1.5rem)] max-w-3xl flex-col overflow-hidden"
      >
        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,190px)]">
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
                onChange={(e) => changeDeviceType(e.target.value as PanelDeviceType)}
                disabled={!!editing}
              >
                <option value="AKUVOX">AKUVOX</option>
                <option value="DNAKE">DNAKE</option>
                <option value="CAMERA">CAMERA</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Địa chỉ IP
                <RequiredMark />
                {onvifIpLocked && (
                  <button
                    type="button"
                    className="ml-2 text-[11px] font-semibold text-primary hover:underline"
                    onClick={changeOnvifCamera}
                  >
                    Đổi camera
                  </button>
                )}
              </label>
              <Input
                placeholder="Địa chỉ IPv4 của thiết bị"
                className={cn('input-design h-10', fieldErrors.ipAddress && 'border-destructive')}
                value={form.ipAddress}
                readOnly={onvifIpLocked}
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
            </div>
            <Input
              placeholder={RTSP_PLACEHOLDER}
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
                ? form.connectionSource === 'ONVIF'
                  ? 'URL được lấy từ profile ONVIF; có thể chỉnh nếu camera yêu cầu đường dẫn riêng.'
                  : 'Nhập RTSP thủ công hoặc chọn camera bằng Quét ONVIF.'
                : 'Dùng để xem live và chụp ảnh lúc chấm. Để trống thì thử RTSP mặc định theo IP; nên điền đúng hoặc Quét ONVIF.'}
            </p>
          </div>
          {(
            <div className="space-y-3 rounded-sm border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-primary">Tìm thiết bị ONVIF</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {selectedOnvifCamera
                      ? `${selectedOnvifCamera.name || 'Thiết bị'} · ${selectedOnvifCamera.ip}`
                      : 'Quét WS-Discovery, chọn Akuvox/DNAKE/camera rồi lấy profile RTSP.'}
                  </p>
                </div>
                {form.connectionSource === 'ONVIF' && form.onvifProfileToken ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-surface-soft p-3">
                <div className="col-span-2 -mb-1 text-xs font-semibold text-muted-foreground">
                  {form.deviceType === 'AKUVOX'
                    ? 'Tài khoản ONVIF + HTTP API (Akuvox)'
                    : form.deviceType === 'DNAKE'
                      ? 'Tài khoản ONVIF + HTTP API (DNAKE)'
                      : 'Tài khoản ONVIF + RTSP (camera)'}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Tài khoản
                    {isAttendancePanel(form.deviceType) && <RequiredMark />}
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
                    {isAttendancePanel(form.deviceType) &&
                      (!editing || !hasPanelPassword(editing, form.deviceType)) && <RequiredMark />}
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={onvifScanning}
                  onClick={() => void runOnvifScan()}
                >
                  {onvifScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                  {onvifScanning ? 'Đang quét…' : 'Quét ONVIF'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={onvifProfilesLoading || !form.ipAddress.trim()}
                  onClick={() => void loadOnvifProfiles()}
                >
                  {onvifProfilesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {onvifProfilesLoading ? 'Đang lấy…' : 'Lấy profile'}
                </Button>
              </div>
              {onvifHits.length > 0 ? (
                <div className="max-h-32 space-y-2 overflow-y-auto pr-1">
                  <p className="text-[11px] font-medium text-muted-foreground">Thiết bị tìm thấy — chọn để điền IP/RTSP</p>
                  {onvifHits.map((hit) => (
                    <button
                      key={hit.ip}
                      type="button"
                      className={cn(
                        'flex w-full flex-col gap-0.5 rounded-sm border bg-surface px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5',
                        selectedOnvifCamera?.ip === hit.ip ? 'border-primary bg-primary/5' : 'border-border',
                      )}
                      onClick={() => applyOnvifHit(hit)}
                    >
                      <span className="text-xs font-semibold text-foreground">
                        {hit.name || hit.ip}
                        <span className="ml-2 font-mono text-[11px] text-primary">{hit.ip}</span>
                      </span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {hit.serviceUrl || 'Device-service URL chưa có'}
                      </span>
                      {(hit.manufacturer || hit.model) && (
                        <span className="text-[10px] text-muted-foreground">
                          {[hit.manufacturer, hit.model].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-[11px] text-muted-foreground">
                  Chưa có kết quả. Hãy nhập credential (nếu camera yêu cầu) rồi bấm Quét ONVIF.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={onvifStreamTesting || !form.ipAddress.trim() || !form.rtspUrl.trim()}
                  onClick={() => void testSelectedOnvifStream()}
                >
                  {onvifStreamTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  {onvifStreamTesting ? 'Đang test…' : 'Test luồng'}
                </Button>
              </div>
              {onvifProfiles.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Profile luồng</label>
                  <Select
                    value={form.onvifProfileToken}
                    onChange={(e) => selectOnvifProfile(e.target.value)}
                  >
                    <option value="">— Chọn profile —</option>
                    {onvifProfiles.map((profile) => (
                      <option key={profile.token} value={profile.token}>
                        {profile.name}{profile.width && profile.height ? ` · ${profile.width}×${profile.height}` : ''}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {form.connectionSource === 'ONVIF' && form.onvifServiceUrl && (
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {form.onvifServiceUrl} · port {form.onvifPort || 80}
                </p>
              )}
              <p className="text-[11px] leading-4 text-muted-foreground">
                {isAttendancePanel(form.deviceType)
                  ? 'Credential này dùng chung cho ONVIF và HTTP API của thiết bị.'
                  : 'Credential này dùng cho ONVIF và RTSP của camera.'}{' '}
                Chỉ gửi trong lúc lấy/test; mật khẩu không hiển thị lại.
              </p>
            </div>
          )}
          </div>
        </div>
        <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button variant="accent" size="sm" disabled={saving} onClick={() => onSave()}>
            {saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
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

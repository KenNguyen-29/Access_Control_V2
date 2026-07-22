import { ApiResponse, PaginatedData } from '@acv2/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (
    contentType.includes('spreadsheetml') ||
    contentType.includes('octet-stream') ||
    contentType.includes('application/vnd.openxmlformats')
  ) {
    if (!res.ok) throw new ApiError('Download failed', res.status);
    return (await res.blob()) as T;
  }

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok || !json.success) {
    throw new ApiError(json.error || json.message || 'Request failed', res.status);
  }

  return json.data as T;
}

export async function login(username: string, password: string) {
  return apiRequest<{
    accessToken: string;
    account: { id: string; username: string; role: string };
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export type StatsOverview = {
  users: number;
  devices: number;
  cameras: number;
  akuvox: number;
  workShifts: number;
  activeAssignments: number;
  todayAttendance: number;
  todayLate: number;
  todayEvents: number;
  todayInvalidEvents: number;
};

export async function getStatsOverview() {
  return apiRequest<StatsOverview>('/stats/overview');
}

export async function getHealth() {
  return apiRequest<HealthStatus>('/health');
}

export type HealthStatus = {
  status: string;
  checks: {
    postgres: boolean;
    redis: boolean | 'skipped';
    minio: boolean;
  };
  queue?: {
    name: string;
    mode?: 'sync';
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    error?: boolean;
  };
  realtime?: {
    lastWebhookAt: string | null;
    lastProcessedAt: string | null;
    lastEmitAt: string | null;
    lastSkipReason: string | null;
    lastAccessLogId: string | null;
    lastMode: 'queue' | 'sync' | null;
    lastJobId: string | null;
  };
  timestamp: string;
};


export type Department = {
  id: string;
  name: string;
  code: string;
};

export type User = {
  id: string;
  fullName: string;
  employeeCode: string;
  email?: string | null;
  phone?: string | null;
  userType?: string;
  departmentId?: string | null;
  department?: Department | null;
  faceImagePath?: string | null;
  faceImageUrl?: string | null;
};

export type Device = {
  id: string;
  name: string;
  code: string;
  deviceType: 'AKUVOX' | 'CAMERA';
  ipAddress?: string | null;
  location?: string | null;
  zoneId?: string | null;
  zone?: { id: string; name: string } | null;
  rtspUrl?: string | null;
  syncStatus?: string;
  isOnline?: boolean;
  lastHeartbeat?: string | null;
  akuvoxUsername?: string | null;
  hasAkuvoxPassword?: boolean;
  rtspUsername?: string | null;
  hasRtspPassword?: boolean;
};

export type DeviceConnectionResult = {
  deviceId: string;
  online: boolean;
  host: string | null;
  port: number | null;
  latencyMs: number;
  checkedAt: string;
  mock: boolean;
  detail?: string | null;
};

export type WorkShift = {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  gracePeriodMinutes?: number;
  salaryCoefficient?: number;
  isOvernight: boolean;
  isDefault: boolean;
};

export type EmployeeShift = {
  id: string;
  userId: string;
  workShiftId: string;
  startDate: string;
  endDate?: string | null;
  user?: User;
  workShift?: WorkShift;
};

export type AttendanceRecord = {
  id: string;
  userId: string;
  date: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  status: string;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  otMinutes?: number;
  user?: User;
  workShift?: WorkShift | null;
};

export type AccessLog = {
  id: string;
  eventAt: string;
  action?: string;
  isValid?: boolean;
  warningMessage?: string | null;
  user?: { fullName: string; employeeCode: string; department?: Department | null } | null;
  device: { id: string; name: string; code: string };
};

export type DeviceMapping = {
  id: string;
  akuvoxDeviceId: string;
  cameraDeviceId: string;
  priority: number;
  akuvoxDevice?: Device;
  cameraDevice?: Device;
};

export async function getDepartments() {
  return apiRequest<Department[]>('/departments');
}

export async function getUsers(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  departmentId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.search) q.set('search', params.search);
  if (params?.departmentId) q.set('departmentId', params.departmentId);
  const qs = q.toString();
  return apiRequest<PaginatedData<User>>(`/users${qs ? `?${qs}` : ''}`);
}

export async function getUserIds(params?: { search?: string; departmentId?: string }) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.departmentId) q.set('departmentId', params.departmentId);
  const qs = q.toString();
  return apiRequest<{ ids: string[]; total: number }>(`/users/ids${qs ? `?${qs}` : ''}`);
}

export async function createUser(data: Partial<User> & { employeeCode?: string; fullName: string }) {
  return apiRequest<User>('/users', { method: 'POST', body: JSON.stringify(data) });
}

export type UserProvisionResult = {
  userId: string;
  zoneIds: string[];
  autoSync: boolean;
  synced: number;
  syncByZone: Array<{
    zoneId: string;
    zoneName: string;
    synced: number;
    devices: number;
    results: Array<{
      deviceId: string;
      deviceName: string;
      zoneId: string | null;
      zoneName?: string;
      ok: boolean;
      error?: string;
    }>;
    mock?: boolean;
  }>;
};

export async function provisionUser(
  userId: string,
  data: { zoneIds: string[]; autoSync?: boolean },
) {
  return apiRequest<UserProvisionResult>(`/users/${userId}/provision`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(id: string, data: Partial<User>) {
  return apiRequest<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteUser(id: string) {
  return apiRequest<null>(`/users/${id}`, { method: 'DELETE' });
}

export type FaceEnrollResult = {
  credential: { id: string };
  faceImagePath: string;
  photoUrl: string;
};

export async function enrollFace(userId: string, imageFile: File) {
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('image', imageFile, imageFile.name || 'face.jpg');
  return apiRequest<FaceEnrollResult>('/credentials/face-enroll', {
    method: 'POST',
    body: formData,
  });
}

export async function getDevices(params?: { page?: number; pageSize?: number; search?: string }) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.search) q.set('search', params.search);
  const qs = q.toString();
  return apiRequest<PaginatedData<Device>>(`/devices${qs ? `?${qs}` : ''}`);
}

export async function createDevice(data: Record<string, unknown>) {
  return apiRequest<Device>('/devices', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateDevice(id: string, data: Record<string, unknown>) {
  return apiRequest<Device>(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteDevice(id: string) {
  return apiRequest<null>(`/devices/${id}`, { method: 'DELETE' });
}

export type WebRtcSessionDescription = { type: string; sdp: string };

export async function exchangeDeviceWebRtc(id: string, offer: WebRtcSessionDescription) {
  return apiRequest<WebRtcSessionDescription>(`/devices/${id}/webrtc`, {
    method: 'POST',
    body: JSON.stringify(offer),
  });
}

export async function openDeviceDoor(id: string) {
  return apiRequest<{ ok: boolean }>(`/devices/${id}/open-door`, { method: 'POST' });
}

export async function syncDeviceCredentials(id: string) {
  return apiRequest<{ synced: number }>(`/devices/${id}/sync-credentials`, { method: 'POST' });
}

export async function testDeviceConnection(id: string) {
  return apiRequest<DeviceConnectionResult>(`/devices/${id}/test-connection`, { method: 'POST' });
}

export async function getAkuvoxWebhookInfo() {
  return apiRequest<{ webhookUrl: string; note: string }>('/devices/akuvox/webhook-info');
}

export async function testAkuvoxDoorLog(params?: { userId?: string; deviceIp?: string }) {
  return apiRequest<{ jobId: string; mode: string; result?: unknown }>('/devices/akuvox/test-door-log', {
    method: 'POST',
    body: JSON.stringify(params ?? {}),
  });
}

export async function getDeviceMappings(akuvoxDeviceId?: string) {
  const qs = akuvoxDeviceId ? `?akuvoxDeviceId=${encodeURIComponent(akuvoxDeviceId)}` : '';
  return apiRequest<DeviceMapping[]>(`/device-mappings${qs}`);
}

export async function createDeviceMapping(data: {
  akuvoxDeviceId: string;
  cameraDeviceId: string;
  priority?: number;
}) {
  return apiRequest<DeviceMapping>('/device-mappings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteDeviceMapping(id: string) {
  return apiRequest<null>(`/device-mappings/${id}`, { method: 'DELETE' });
}

export async function getWorkShifts() {
  return apiRequest<WorkShift[]>('/shifts/work-shifts');
}

export async function createWorkShift(data: Partial<WorkShift> & {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
}) {
  return apiRequest<WorkShift>('/shifts/work-shifts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWorkShift(id: string, data: Partial<WorkShift>) {
  return apiRequest<WorkShift>(`/shifts/work-shifts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkShift(id: string) {
  return apiRequest<null>(`/shifts/work-shifts/${id}`, { method: 'DELETE' });
}

export async function getDefaultShift() {
  return apiRequest<WorkShift | null>('/shifts/default');
}

export async function setDefaultShift(workShiftId: string) {
  return apiRequest<WorkShift>('/shifts/default', {
    method: 'POST',
    body: JSON.stringify({ workShiftId }),
  });
}

export async function getEmployeeShifts(userId?: string) {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return apiRequest<EmployeeShift[]>(`/shifts/employee-shifts${qs}`);
}

export async function createEmployeeShift(data: {
  userId: string;
  workShiftId: string;
  startDate: string;
  endDate?: string;
}) {
  return apiRequest<EmployeeShift>('/shifts/employee-shifts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export type BulkAssignResult = {
  assigned: number;
  skipped: number;
  skippedUserIds: string[];
};

export async function bulkAssignEmployeeShift(data: {
  userIds: string[];
  workShiftId: string;
  startDate: string;
  endDate?: string;
}) {
  return apiRequest<BulkAssignResult>('/shifts/employee-shifts/bulk', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function endEmployeeShift(id: string, endDate?: string) {
  return apiRequest<EmployeeShift>(`/shifts/employee-shifts/${id}/end`, {
    method: 'POST',
    body: JSON.stringify({ endDate }),
  });
}

export async function deleteEmployeeShift(id: string) {
  return apiRequest<null>(`/shifts/employee-shifts/${id}`, { method: 'DELETE' });
}

export async function getAttendanceRecords(params?: {
  page?: number;
  pageSize?: number;
  userId?: string;
  from?: string;
  to?: string;
  departmentId?: string;
  status?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.userId) q.set('userId', params.userId);
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.departmentId) q.set('departmentId', params.departmentId);
  if (params?.status) q.set('status', params.status);
  const qs = q.toString();
  return apiRequest<PaginatedData<AttendanceRecord>>(`/attendance/records${qs ? `?${qs}` : ''}`);
}

export async function getAccessLogs(
  params?:
    | number
    | {
        limit?: number;
        deviceId?: string;
        action?: string;
        isValid?: boolean;
        unknownOnly?: boolean;
      },
) {
  const opts = typeof params === 'number' ? { limit: params } : params ?? {};
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 50));
  if (opts.deviceId) q.set('deviceId', opts.deviceId);
  if (opts.action) q.set('action', opts.action);
  if (opts.isValid !== undefined) q.set('isValid', String(opts.isValid));
  if (opts.unknownOnly) q.set('unknownOnly', 'true');
  return apiRequest<AccessLog[]>(`/attendance/access-logs?${q.toString()}`);
}

export async function exportAttendance(params?: { from?: string; to?: string; userId?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.userId) q.set('userId', params.userId);
  const qs = q.toString();
  return apiRequest<Blob>(`/attendance/export${qs ? `?${qs}` : ''}`);
}

export async function downloadAttendanceTemplate() {
  return apiRequest<Blob>('/attendance/export-template');
}

export type AttendanceImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export async function importAttendance(file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<AttendanceImportResult>('/attendance/import', {
    method: 'POST',
    body: form,
  });
}

export type AttendanceSummaryTotals = {
  totalRecords: number;
  staffCount: number;
  presentCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  absentCount: number;
  otMinutes: number;
  workedMinutes: number;
};

export type TimesheetRow = {
  userId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string | null;
  daysWorked: number;
  workedMinutes: number;
  lateCount: number;
  earlyCount: number;
  otMinutes: number;
};

export type AttendanceSummary = {
  summary: AttendanceSummaryTotals;
  timesheet: TimesheetRow[];
};

export type WeeklyRow = {
  userId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string | null;
  date: string;
  weekday: number;
  shiftName: string | null;
  shiftCode: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  otMinutes: number;
  workedMinutes: number;
  salaryCoefficient: number;
  status: string;
};

export type WeeklyTimesheet = {
  weekStart: string;
  weekEnd: string;
  rows: WeeklyRow[];
};

export async function getAttendanceSummary(params: {
  from: string;
  to: string;
  departmentId?: string;
}) {
  const q = new URLSearchParams();
  q.set('from', params.from);
  q.set('to', params.to);
  if (params.departmentId) q.set('departmentId', params.departmentId);
  return apiRequest<AttendanceSummary>(`/stats/attendance-summary?${q.toString()}`);
}

export async function getWeeklyTimesheet(params: {
  weekStart?: string;
  from?: string;
  to?: string;
  departmentId?: string;
}) {
  const q = new URLSearchParams();
  if (params.weekStart) q.set('weekStart', params.weekStart);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.departmentId) q.set('departmentId', params.departmentId);
  return apiRequest<WeeklyTimesheet>(`/stats/weekly-timesheet?${q.toString()}`);
}

// ── Access zones / permissions / settings / emergency ──────

export type AccessZone = {
  id: string;
  name: string;
  parentZoneId?: string | null;
  description?: string | null;
  parentZone?: AccessZone | null;
  childZones?: AccessZone[];
};

export type UserAccessPermission = {
  id: string;
  userId: string;
  zoneId: string;
  validFrom?: string | null;
  validTo?: string | null;
  user?: {
    id: string;
    fullName: string;
    employeeCode: string;
    departmentId?: string | null;
    faceImagePath?: string | null;
    department?: { name: string } | null;
  };
  zone?: AccessZone;
};

export type UserAccessSummary = {
  user: {
    userId: string;
    fullName: string;
    employeeCode: string;
    photoUrl?: string | null;
    departmentName?: string | null;
  };
  credentials: Array<{ id: string; type: string; isActive: boolean; syncStatus: string }>;
  zones: Array<{
    zoneId: string;
    zoneName: string;
    permissionId: string;
    scheduleName: string | null;
    scheduleWindow: { start: string; end: string } | null;
    isAllDay: boolean;
    devices: Array<{
      deviceId: string;
      deviceName: string;
      deviceCode: string;
      syncStatus: string;
    }>;
  }>;
};

export type SystemSetting = { id: string; key: string; value: string };

export type CredentialRow = {
  id: string;
  userId: string;
  type: string;
  isActive: boolean;
  syncStatus: string;
  externalId?: string | null;
  cardNumber?: string | null;
  user?: { id: string; fullName: string; employeeCode: string; departmentId?: string | null };
};

export type EmergencyMusterRow = {
  id: string;
  eventId: string;
  userId: string;
  safeStatus: 'INSIDE' | 'SAFE' | 'MISSING';
  remarks?: string | null;
  markedTime?: string | null;
  user?: {
    id: string;
    fullName: string;
    employeeCode: string;
    phone?: string | null;
    faceImagePath?: string | null;
  };
};

export type EmergencyDashboard = {
  event: {
    id: string;
    eventType: string;
    startTime?: string | null;
    endTime?: string | null;
    description?: string | null;
  } | null;
  muster: EmergencyMusterRow[];
};

export async function getAccessZones(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<AccessZone[]>(`/access-zones${qs}`);
}

export async function createAccessZone(data: {
  name: string;
  parentZoneId?: string;
  description?: string;
}) {
  return apiRequest<AccessZone>('/access-zones', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAccessZone(
  id: string,
  data: { name?: string; parentZoneId?: string; description?: string },
) {
  return apiRequest<AccessZone>(`/access-zones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteAccessZone(id: string) {
  return apiRequest<null>(`/access-zones/${id}`, { method: 'DELETE' });
}

export async function getPermissions(params?: { userId?: string; zoneId?: string }) {
  const q = new URLSearchParams();
  if (params?.userId) q.set('userId', params.userId);
  if (params?.zoneId) q.set('zoneId', params.zoneId);
  const qs = q.toString();
  return apiRequest<UserAccessPermission[]>(`/permissions${qs ? `?${qs}` : ''}`);
}

export async function getUserAccessSummary(userId: string) {
  return apiRequest<UserAccessSummary>(`/permissions/user/${userId}/summary`);
}

export async function createPermission(data: {
  userId: string;
  zoneId: string;
  validFrom?: string;
  validTo?: string;
}) {
  return apiRequest<UserAccessPermission>('/permissions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deletePermission(id: string) {
  return apiRequest<null>(`/permissions/${id}`, { method: 'DELETE' });
}

export async function getAccessZoneSchedules() {
  return apiRequest<{ schedules: Record<string, string> }>(
    '/system-settings/groups/access-zone-schedules',
  );
}

export async function updateAccessZoneSchedules(schedules: Record<string, string>) {
  return apiRequest<{ schedules: Record<string, string> }>(
    '/system-settings/groups/access-zone-schedules',
    { method: 'PUT', body: JSON.stringify({ schedules }) },
  );
}

export async function getSystemSettings() {
  return apiRequest<SystemSetting[]>('/system-settings');
}

export async function upsertSystemSetting(key: string, value: string) {
  return apiRequest<SystemSetting>(`/system-settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export async function getCredentialsList(status?: 'active' | 'revoked') {
  const qs = status ? `?status=${status}` : '';
  return apiRequest<CredentialRow[]>(`/credentials${qs}`);
}

export async function revokeCredential(id: string) {
  return apiRequest<CredentialRow>(`/credentials/${id}/revoke`, { method: 'POST' });
}

export async function syncUserCredentials(userId: string, zoneId?: string) {
  return apiRequest<{
    synced: number;
    devices: number;
    mock?: boolean;
    results?: Array<{
      deviceId: string;
      deviceName: string;
      zoneId: string | null;
      zoneName?: string;
      ok: boolean;
      error?: string;
    }>;
  }>(`/devices/users/${userId}/sync`, {
    method: 'POST',
    body: JSON.stringify({ zoneId }),
  });
}

export async function createDepartment(data: {
  name: string;
  code: string;
  description?: string;
}) {
  return apiRequest<Department>('/departments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDepartment(
  id: string,
  data: { name?: string; code?: string; description?: string },
) {
  return apiRequest<Department>(`/departments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteDepartment(id: string) {
  return apiRequest<null>(`/departments/${id}`, { method: 'DELETE' });
}

export async function getEmergencyDashboard(eventId?: string) {
  const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
  return apiRequest<EmergencyDashboard>(`/emergency/dashboard${qs}`);
}

export async function triggerEmergencyDrill(description?: string) {
  return apiRequest<{ event: { id: string }; musterCount: number }>('/emergency/drill', {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
}

export async function triggerEmergencyFire(description?: string) {
  return apiRequest<{ event: { id: string }; musterCount: number }>('/emergency/webhook/fire', {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
}

export async function updateMusterStatus(
  musterId: string,
  data: { safeStatus: 'INSIDE' | 'SAFE' | 'MISSING'; remarks?: string },
) {
  return apiRequest<EmergencyMusterRow>(`/emergency/muster/${musterId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function endEmergency(eventId: string) {
  return apiRequest<{ ended: boolean }>(`/emergency/${eventId}/end`, { method: 'POST' });
}


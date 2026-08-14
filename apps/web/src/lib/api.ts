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

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await res.json()) as ApiResponse<{ accessToken: string; account?: unknown }>;
      if (!res.ok || !json.success || !json.data?.accessToken) return null;
      localStorage.setItem('accessToken', json.data.accessToken);
      if (json.data.account) {
        localStorage.setItem('account', JSON.stringify(json.data.account));
      }
      return json.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  _retried = false,
): Promise<T> {
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  // Browser must set multipart boundary itself — never force JSON on FormData.
  if (isFormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
    const next = await refreshAccessToken();
    if (next) {
      return apiRequest<T>(path, options, true);
    }
  }

  const contentType = res.headers.get('content-type') || '';
  if (
    contentType.includes('spreadsheetml') ||
    contentType.includes('octet-stream') ||
    contentType.includes('application/vnd.openxmlformats')
  ) {
    if (!res.ok) throw new ApiError('Download failed', res.status);
    return (await res.blob()) as T;
  }

  const json = (await res.json()) as ApiResponse<T> & { error?: string; statusCode?: number };

  if (!res.ok || !json.success) {
    throw new ApiError(json.error || json.message || 'Request failed', res.status);
  }

  return json.data as T;
}

export type AuthAccount = {
  id: string;
  username: string;
  role: string;
  mustChangePassword?: boolean;
  mfaEnabled?: boolean;
  projectIds?: string[];
};

export async function login(username: string, password: string) {
  return apiRequest<{
    accessToken: string;
    mustChangePassword?: boolean;
    mfaEnabled?: boolean;
    mfaRequired?: boolean;
    account: AuthAccount;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function refreshSession() {
  return apiRequest<{
    accessToken: string;
    mustChangePassword?: boolean;
    account: AuthAccount;
  }>('/auth/refresh', { method: 'POST' });
}

export async function getMe() {
  return apiRequest<AuthAccount>('/auth/me');
}

export async function logout() {
  return apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ ok: boolean; mustChangePassword: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export type StatsOverview = {
  users: number;
  devices: number;
  cameras: number;
  akuvox: number;
  workShifts: number;
  activeAssignments: number;
  unassignedEmployees: number;
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
  citizenId?: string | null;
  userType?: string;
  departmentId?: string | null;
  department?: Department | null;
  contractorId?: string | null;
  contractor?: Contractor | null;
  projectId?: string | null;
  project?: Project | null;
  faceImagePath?: string | null;
  faceImageUrl?: string | null;
};

export type Contractor = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  _count?: { users: number; projects: number };
};

export type Project = {
  id: string;
  name: string;
  code: string;
  siteName?: string | null;
  description?: string | null;
  contractors?: Array<{
    id: string;
    contractorId: string;
    contractor: Contractor;
  }>;
  _count?: { users: number };
};

export type Device = {
  id: string;
  name: string;
  code: string;
  deviceType: 'AKUVOX' | 'DNAKE' | 'CAMERA';
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
  dnakeUsername?: string | null;
  hasDnakePassword?: boolean;
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

export type EmployeeShiftAssignType = 'FIXED' | 'RANGED';

export type EmployeeShift = {
  id: string;
  userId: string;
  workShiftId: string;
  startDate: string;
  endDate?: string | null;
  assignmentType?: EmployeeShiftAssignType;
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
  punchLocation?: {
    zoneId: string | null;
    zoneName: string | null;
    deviceId: string | null;
    deviceName: string | null;
  } | null;
};

export type AccessLog = {
  id: string;
  eventAt: string;
  action?: string;
  isValid?: boolean;
  warningMessage?: string | null;
  zoneId?: string | null;
  user?: { fullName: string; employeeCode: string; department?: Department | null } | null;
  device: { id: string; name: string; code: string };
  zone?: { id: string; name: string } | null;
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

export async function getContractors() {
  return apiRequest<Contractor[]>('/contractors');
}

export async function createContractor(data: {
  name: string;
  code: string;
  description?: string;
}) {
  return apiRequest<Contractor>('/contractors', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateContractor(
  id: string,
  data: { name?: string; code?: string; description?: string },
) {
  return apiRequest<Contractor>(`/contractors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteContractor(id: string) {
  return apiRequest<null>(`/contractors/${id}`, { method: 'DELETE' });
}

export async function getProjects(params?: { contractorId?: string }) {
  const q = new URLSearchParams();
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  const qs = q.toString();
  return apiRequest<Project[]>(`/projects${qs ? `?${qs}` : ''}`);
}

export async function createProject(data: {
  name: string;
  code: string;
  siteName?: string;
  description?: string;
  contractorIds?: string[];
}) {
  return apiRequest<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(
  id: string,
  data: {
    name?: string;
    code?: string;
    siteName?: string;
    description?: string;
    contractorIds?: string[];
  },
) {
  return apiRequest<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string) {
  return apiRequest<null>(`/projects/${id}`, { method: 'DELETE' });
}

export async function getUsers(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  departmentId?: string;
  contractorId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.search) q.set('search', params.search);
  if (params?.departmentId) q.set('departmentId', params.departmentId);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<PaginatedData<User>>(`/users${qs ? `?${qs}` : ''}`);
}

export async function getUserIds(params?: {
  search?: string;
  departmentId?: string;
  contractorId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.departmentId) q.set('departmentId', params.departmentId);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<{ ids: string[]; total: number }>(`/users/ids${qs ? `?${qs}` : ''}`);
}

export async function createUser(data: Partial<User> & { employeeCode?: string; fullName: string }) {
  return apiRequest<User>('/users', { method: 'POST', body: JSON.stringify(data) });
}

export type UsersImportResult = {
  created: number;
  updated: number;
  skipped: number;
  facesEnrolled?: number;
  zonesAssigned?: number;
  errors: Array<{ row: number; message: string }>;
};

export async function downloadUsersImportTemplate() {
  return apiRequest<Blob>('/users/import-template');
}

export async function importUsers(file: File) {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<UsersImportResult>('/users/import', {
    method: 'POST',
    body: form,
  });
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

export type UserProjectTransferResult = {
  user: User;
  fromProjectId: string | null;
  toProjectId: string;
  zoneId: string;
  revokedZoneIds: string[];
  sync: {
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
  };
};

export async function transferUserProject(
  userId: string,
  data: {
    toProjectId: string;
    zoneId: string;
    workShiftId?: string;
    note?: string;
  },
) {
  return apiRequest<UserProjectTransferResult>(`/users/${userId}/transfer-project`, {
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
  if (!userId?.trim()) {
    throw new ApiError('Thiếu userId khi đăng ký FaceID', 400);
  }
  if (!imageFile || imageFile.size < 100) {
    throw new ApiError('Vui lòng chọn ảnh khuôn mặt hợp lệ', 400);
  }
  const formData = new FormData();
  formData.append('userId', userId.trim());
  formData.append('image', imageFile, imageFile.name || 'face.jpg');
  return apiRequest<FaceEnrollResult>('/credentials/face-enroll', {
    method: 'POST',
    body: formData,
  });
}

export async function getDevices(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  zoneId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.search) q.set('search', params.search);
  if (params?.zoneId) q.set('zoneId', params.zoneId);
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
  mode?: EmployeeShiftAssignType;
  startDate?: string;
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
  mode?: EmployeeShiftAssignType;
};

export async function bulkAssignEmployeeShift(data: {
  userIds: string[];
  workShiftId: string;
  mode: EmployeeShiftAssignType;
  startDate?: string;
  endDate?: string;
}) {
  return apiRequest<BulkAssignResult>('/shifts/employee-shifts/bulk', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function endEmployeeShift(id: string, endDate?: string) {
  const today = new Date();
  const fallback = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return apiRequest<EmployeeShift>(`/shifts/employee-shifts/${id}/end`, {
    method: 'POST',
    body: JSON.stringify({ endDate: endDate || fallback }),
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
  search?: string;
  hasLate?: boolean;
  hasEarlyLeave?: boolean;
  hasOt?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.userId) q.set('userId', params.userId);
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.departmentId) q.set('departmentId', params.departmentId);
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  if (params?.hasLate !== undefined) q.set('hasLate', String(params.hasLate));
  if (params?.hasEarlyLeave !== undefined) q.set('hasEarlyLeave', String(params.hasEarlyLeave));
  if (params?.hasOt !== undefined) q.set('hasOt', String(params.hasOt));
  const qs = q.toString();
  return apiRequest<PaginatedData<AttendanceRecord>>(`/attendance/records${qs ? `?${qs}` : ''}`);
}

export async function getAccessLogs(
  params?:
    | number
    | {
        limit?: number;
        deviceId?: string;
        zoneId?: string;
        action?: string;
        isValid?: boolean;
        unknownOnly?: boolean;
      },
) {
  const opts = typeof params === 'number' ? { limit: params } : params ?? {};
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 50));
  if (opts.deviceId) q.set('deviceId', opts.deviceId);
  if (opts.zoneId) q.set('zoneId', opts.zoneId);
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
  /** Số ngày đi sớm (check-in trước giờ ca). */
  earlyArrivalCount?: number;
  /** Số ngày về sớm. */
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
  zoneName?: string | null;
  deviceName?: string | null;
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

export type SystemSetting = { id: string; key: string; value: string; isMasked?: boolean };

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

export type AuditLogRow = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  metadata?: unknown;
  createdAt: string;
};

export async function getAuditLogs(params?: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  actorId?: string;
  entity?: string;
  action?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.actorId) q.set('actorId', params.actorId);
  if (params?.entity) q.set('entity', params.entity);
  if (params?.action) q.set('action', params.action);
  const qs = q.toString();
  return apiRequest<PaginatedData<AuditLogRow>>(`/audit-logs${qs ? `?${qs}` : ''}`);
}

export type IntegrationStatus = {
  akuvox: {
    webhookUrl: string;
    tokenConfigured: boolean;
    allowedIps: string;
    mockMode: boolean;
    source: { token: string; ips: string };
  };
  redis: {
    enabled: boolean;
    status: boolean | 'skipped';
    host: string;
    port: string;
    note: string;
  };
  queue: unknown;
};

export async function getIntegrationStatus() {
  return apiRequest<IntegrationStatus>('/integration/status');
}

export type BackupStatus = {
  enabled: boolean;
  cron: string;
  retentionDays: number;
  backupDir: string;
  files: Array<{ name: string; size: number; mtime: string }>;
};

export async function getBackupStatus() {
  return apiRequest<BackupStatus>('/backup/status');
}

export async function runBackupNow() {
  return apiRequest<unknown>('/backup/run', { method: 'POST' });
}

export async function rescheduleBackup() {
  return apiRequest<BackupStatus>('/backup/reschedule', { method: 'POST' });
}

export async function runRetentionNow() {
  return apiRequest<unknown>('/retention/run', { method: 'POST' });
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

export async function getContractorHeadcount(date?: string) {
  const q = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest<{
    date: string;
    rows: Array<{
      contractorId: string;
      code: string;
      name: string;
      registeredCount: number;
      presentCount: number;
      date: string;
    }>;
  }>(`/contractor-reports/headcount${q}`);
}

export async function getContractorPersonnel(params?: {
  from?: string;
  to?: string;
  contractorId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<{ from: string; to: string; rows: Array<Record<string, unknown>> }>(
    `/contractor-reports/personnel${qs ? `?${qs}` : ''}`,
  );
}

export async function getContractorAccessLogs(params?: {
  from?: string;
  to?: string;
  contractorId?: string;
  projectId?: string;
  userId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  if (params?.userId) q.set('userId', params.userId);
  const qs = q.toString();
  return apiRequest<{ from: string; to: string; rows: Array<Record<string, unknown>> }>(
    `/contractor-reports/access-logs${qs ? `?${qs}` : ''}`,
  );
}

export async function getShiftPersonnelReport(params?: {
  contractorId?: string;
  workShiftId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.workShiftId) q.set('workShiftId', params.workShiftId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<{ asOf: string; rows: Array<Record<string, unknown>> }>(
    `/contractor-reports/shift-personnel${qs ? `?${qs}` : ''}`,
  );
}

export async function downloadContractorPersonnelExcel(params?: {
  from?: string;
  to?: string;
  contractorId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<Blob>(`/contractor-reports/export/personnel${qs ? `?${qs}` : ''}`);
}

export async function downloadContractorAccessLogsExcel(params?: {
  from?: string;
  to?: string;
  contractorId?: string;
  projectId?: string;
  userId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  if (params?.userId) q.set('userId', params.userId);
  const qs = q.toString();
  return apiRequest<Blob>(`/contractor-reports/export/access-logs${qs ? `?${qs}` : ''}`);
}

export async function downloadShiftPersonnelExcel(params?: {
  contractorId?: string;
  workShiftId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.workShiftId) q.set('workShiftId', params.workShiftId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<Blob>(`/contractor-reports/export/shift-personnel${qs ? `?${qs}` : ''}`);
}

export async function downloadContractorHeadcountExcel(params?: { date?: string }) {
  const q = new URLSearchParams();
  if (params?.date) q.set('date', params.date);
  const qs = q.toString();
  return apiRequest<Blob>(`/contractor-reports/export/headcount${qs ? `?${qs}` : ''}`);
}

export async function getContractorMonthly(params?: {
  month?: string;
  contractorId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.month) q.set('month', params.month);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<{
    month: string;
    days: number;
    rows: Array<{
      userId: string;
      employeeCode: string;
      fullName: string;
      citizenId: string | null;
      contractorName: string | null;
      projectName: string | null;
      workDays: number;
      lateDays: number;
      lateMinutes: number;
      earlyLeaveMinutes: number;
      otMinutes: number;
    }>;
  }>(`/contractor-reports/monthly${qs ? `?${qs}` : ''}`);
}

export async function downloadContractorMonthlyExcel(params?: {
  month?: string;
  contractorId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.month) q.set('month', params.month);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<Blob>(`/contractor-reports/export/monthly${qs ? `?${qs}` : ''}`);
}

export async function downloadContractorMonthlyDetailExcel(params?: {
  month?: string;
  contractorId?: string;
  projectId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.month) q.set('month', params.month);
  if (params?.contractorId) q.set('contractorId', params.contractorId);
  if (params?.projectId) q.set('projectId', params.projectId);
  const qs = q.toString();
  return apiRequest<Blob>(`/contractor-reports/export/monthly-detail${qs ? `?${qs}` : ''}`);
}

export async function runContractorSnapshot(params?: { date?: string; push?: boolean }) {
  const q = new URLSearchParams();
  if (params?.date) q.set('date', params.date);
  if (params?.push === false) q.set('push', 'false');
  const qs = q.toString();
  return apiRequest<unknown>(`/contractor-reports/snapshot${qs ? `?${qs}` : ''}`, {
    method: 'POST',
  });
}

export async function getContractorSnapshots(limit = 30) {
  return apiRequest<
    Array<{
      id: string;
      date: string;
      headcount: number;
      pushStatus?: string | null;
      pushError?: string | null;
      contractor?: Contractor;
    }>
  >(`/contractor-reports/snapshots?limit=${limit}`);
}

export type Role = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
};

export type SystemAccount = {
  id: string;
  username: string;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordChangedAt?: string | null;
  createdAt: string;
  role: Role;
  projectIds: string[];
  projects: Array<{ id: string; name: string; code: string }>;
};

export async function getRoles() {
  return apiRequest<Role[]>('/roles');
}

export async function getAccounts(params?: { page?: number; pageSize?: number; search?: string }) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.search) q.set('search', params.search);
  const qs = q.toString();
  return apiRequest<PaginatedData<SystemAccount>>(`/accounts${qs ? `?${qs}` : ''}`);
}

export async function createAccount(data: {
  username: string;
  password: string;
  roleId: string;
  projectIds?: string[];
  isActive?: boolean;
}) {
  return apiRequest<SystemAccount>('/accounts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAccount(
  id: string,
  data: {
    roleId?: string;
    password?: string;
    projectIds?: string[];
    isActive?: boolean;
    mustChangePassword?: boolean;
  },
) {
  return apiRequest<SystemAccount>(`/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteAccount(id: string) {
  return apiRequest<null>(`/accounts/${id}`, { method: 'DELETE' });
}


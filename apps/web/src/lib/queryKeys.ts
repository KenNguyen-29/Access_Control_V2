/**
 * Centralized React Query keys so components fetch and invalidate consistently.
 * Keys are arrays; params are appended for scoping (e.g. pagination/search).
 */
export const queryKeys = {
  users: (params?: Record<string, unknown>) =>
    params ? (['users', params] as const) : (['users'] as const),
  departments: () => ['departments'] as const,
  devices: (params?: Record<string, unknown>) =>
    params ? (['devices', params] as const) : (['devices'] as const),
  deviceMappings: () => ['deviceMappings'] as const,
  workShifts: () => ['workShifts'] as const,
  employeeShifts: (params?: Record<string, unknown> | string) =>
    params != null ? (['employeeShifts', params] as const) : (['employeeShifts'] as const),
  defaultShift: () => ['defaultShift'] as const,
  attendanceRecords: (params?: Record<string, unknown>) =>
    params ? (['attendanceRecords', params] as const) : (['attendanceRecords'] as const),
  attendanceSummary: (params?: Record<string, unknown>) =>
    params ? (['attendanceSummary', params] as const) : (['attendanceSummary'] as const),
  analyticsStats: (params?: Record<string, unknown>) =>
    params ? (['analyticsStats', params] as const) : (['analyticsStats'] as const),
  weeklyTimesheet: (params?: Record<string, unknown>) =>
    params ? (['weeklyTimesheet', params] as const) : (['weeklyTimesheet'] as const),
  accessLogs: (params?: Record<string, unknown> | number) =>
    params != null ? (['accessLogs', params] as const) : (['accessLogs'] as const),
  accessZones: (search?: string) =>
    search ? (['accessZones', search] as const) : (['accessZones'] as const),
  permissions: (params?: Record<string, unknown>) =>
    params ? (['permissions', params] as const) : (['permissions'] as const),
  userAccessSummary: (userId: string) => ['userAccessSummary', userId] as const,
  accessZoneSchedules: () => ['accessZoneSchedules'] as const,
  systemSettings: () => ['systemSettings'] as const,
  integrationStatus: () => ['integrationStatus'] as const,
  backupStatus: () => ['backupStatus'] as const,
  auditLogs: (params?: Record<string, unknown>) =>
    params ? (['auditLogs', params] as const) : (['auditLogs'] as const),
  credentials: (status?: string) =>
    status ? (['credentials', status] as const) : (['credentials'] as const),
  emergencyDashboard: (eventId?: string) =>
    eventId ? (['emergencyDashboard', eventId] as const) : (['emergencyDashboard'] as const),
  homeDashboard: (params?: { from?: string; to?: string; accountId?: string }) =>
    [
      'homeDashboard',
      params?.accountId ?? '',
      params?.from ?? '',
      params?.to ?? '',
    ] as const,
  contractors: (accountId?: string) =>
    accountId ? (['contractors', accountId] as const) : (['contractors'] as const),
} as const;

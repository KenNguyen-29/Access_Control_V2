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
  employeeShifts: (userId?: string) =>
    userId ? (['employeeShifts', userId] as const) : (['employeeShifts'] as const),
  defaultShift: () => ['defaultShift'] as const,
  attendanceRecords: (params?: Record<string, unknown>) =>
    params ? (['attendanceRecords', params] as const) : (['attendanceRecords'] as const),
  attendanceSummary: (params?: Record<string, unknown>) =>
    params ? (['attendanceSummary', params] as const) : (['attendanceSummary'] as const),
  weeklyTimesheet: (params?: Record<string, unknown>) =>
    params ? (['weeklyTimesheet', params] as const) : (['weeklyTimesheet'] as const),
  accessLogs: (limit?: number) =>
    limit != null ? (['accessLogs', limit] as const) : (['accessLogs'] as const),
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
} as const;

export enum UserRole {
  ADMIN = 'ADMIN',
  HR = 'HR',
  SECURITY = 'SECURITY',
  TECHNICIAN = 'TECHNICIAN',
  STAFF = 'STAFF',
}

export enum DeviceType {
  AKUVOX = 'AKUVOX',
  DNAKE = 'DNAKE',
  CAMERA = 'CAMERA',
}

export enum AccessAction {
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  DENIED = 'DENIED',
  UNKNOWN = 'UNKNOWN',
  FIRE_EMERGENCY = 'FIRE_EMERGENCY',
}

export enum PresenceStatus {
  CHECK_IN = 'CHECK_IN',
  INSIDE = 'INSIDE',
  CHECK_OUT = 'CHECK_OUT',
  OUTSIDE = 'OUTSIDE',
}

export enum EmergencySafeStatus {
  INSIDE = 'INSIDE',
  SAFE = 'SAFE',
  MISSING = 'MISSING',
}

export enum AttendanceStatus {
  ON_TIME = 'ON_TIME',
  LATE = 'LATE',
  EARLY_LEAVE = 'EARLY_LEAVE',
  ABSENT = 'ABSENT',
  OVERTIME = 'OVERTIME',
}

export enum DeviceSyncStatus {
  SYNCED = 'SYNCED',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum CredentialType {
  FACE = 'FACE',
  CARD = 'CARD',
  PIN = 'PIN',
}

export enum UserType {
  EMPLOYEE = 'EMPLOYEE',
  VISITOR = 'VISITOR',
  CONTRACTOR = 'CONTRACTOR',
}

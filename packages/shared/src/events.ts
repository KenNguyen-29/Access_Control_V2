import { AccessAction } from './enums';

export interface CheckinEvent {
  id: string;
  userId?: string;
  employeeCode?: string;
  fullName?: string;
  departmentName?: string;
  deviceId: string;
  deviceName?: string;
  action: AccessAction;
  timestamp: string;
  snapshotUrl?: string;
  faceImageUrl?: string;
  isValid: boolean;
  warningMessage?: string;
}

export interface FireEmergencyPerson {
  musterId: string;
  userId: string;
  fullName: string;
  employeeCode?: string;
  safeStatus: string;
}

export interface FireEmergencyEvent {
  type: 'FIRE_EMERGENCY';
  eventId: string;
  description?: string;
  people: FireEmergencyPerson[];
}

export const SOCKET_EVENTS = {
  CHECKIN_EVENT: 'checkin_event',
  DEVICE_STATUS: 'device_status',
  CAMERA_STATUS: 'camera_status',
  FIRE_EMERGENCY: 'fire_emergency',
} as const;

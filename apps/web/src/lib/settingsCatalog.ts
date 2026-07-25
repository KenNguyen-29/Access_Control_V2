import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Clock,
  HardDrive,
  KeyRound,
  LayoutGrid,
  MapPin,
  ScrollText,
  Shield,
  Users,
} from 'lucide-react';

export type SettingsSectionId =
  | 'general'
  | 'integration'
  | 'attendance'
  | 'monitoring'
  | 'hr'
  | 'access'
  | 'shifts'
  | 'data';

export interface SettingsLinkItem {
  id: string;
  path: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  items: SettingsLinkItem[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'hr',
    label: 'Nhân sự',
    items: [
      {
        id: 'account',
        path: '/users',
        icon: Users,
        title: 'Tài khoản',
        description: 'Quản lý tài khoản và nhân viên',
      },
      {
        id: 'departments',
        path: '/settings/departments',
        icon: Building2,
        title: 'Phòng ban',
        description: 'Cấu trúc phòng ban / bộ phận',
      },
    ],
  },
  {
    id: 'access',
    label: 'Ra vào',
    items: [
      {
        id: 'zones',
        path: '/settings/zones',
        icon: MapPin,
        title: 'Khu vực',
        description: 'Quản lý khu vực truy cập',
      },
      {
        id: 'accessControl',
        path: '/access-control',
        icon: Shield,
        title: 'Kiểm soát ra vào',
        description: 'Phân quyền khu vực & lịch trình',
      },
      {
        id: 'credentials',
        path: '/settings/credentials',
        icon: KeyRound,
        title: 'Thông tin đăng nhập',
        description: 'FaceID, thẻ & đồng bộ thiết bị',
      },
      {
        id: 'devices',
        path: '/devices',
        icon: LayoutGrid,
        title: 'Thiết bị',
        description: 'Akuvox & Camera',
      },
    ],
  },
  {
    id: 'shifts',
    label: 'Ca làm',
    items: [
      {
        id: 'shifts',
        path: '/shifts',
        icon: Clock,
        title: 'Ca làm',
        description: 'Cấu hình ca & gán nhân viên',
      },
    ],
  },
  {
    id: 'data',
    label: 'Bảo mật & dữ liệu',
    items: [
      {
        id: 'storage',
        path: '/settings/storage',
        icon: HardDrive,
        title: 'Lưu trữ',
        description: 'Thời gian giữ log, snapshot & chấm công',
      },
      {
        id: 'audit',
        path: '/settings/audit',
        icon: ScrollText,
        title: 'Audit Log',
        description: 'Nhật ký thao tác hệ thống',
      },
    ],
  },
];

export const SETTINGS_NAV: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'general', label: 'Chung' },
  { id: 'integration', label: 'Tích hợp' },
  { id: 'attendance', label: 'Chấm công' },
  { id: 'monitoring', label: 'Giám sát' },
  ...SETTINGS_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
];

export function getSectionLinks(sectionId: SettingsSectionId): SettingsLinkItem[] {
  if (
    sectionId === 'general' ||
    sectionId === 'integration' ||
    sectionId === 'attendance' ||
    sectionId === 'monitoring'
  ) {
    return [];
  }
  return SETTINGS_SECTIONS.find((s) => s.id === sectionId)?.items ?? [];
}

export const SETTING_KEYS = {
  DATE_FORMAT: 'DATE_FORMAT',
  AUTO_LOGOUT_ENABLED: 'AUTO_LOGOUT_ENABLED',
  LOG_RETENTION_DAYS: 'LOG_RETENTION_DAYS',
  STORAGE_RETENTION_DAYS: 'STORAGE_RETENTION_DAYS',
  ATTENDANCE_RETENTION_DAYS: 'ATTENDANCE_RETENTION_DAYS',
  ATTENDANCE_LATE_GRACE_MINUTES: 'ATTENDANCE_LATE_GRACE_MINUTES',
  ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES: 'ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES',
  PUNCH_COOLDOWN_MINUTES: 'PUNCH_COOLDOWN_MINUTES',
  OT_AFTER_MINUTES: 'OT_AFTER_MINUTES',
  OT_MULTIPLIER: 'OT_MULTIPLIER',
  CAMERA_DEFAULT_LAYOUT: 'CAMERA_DEFAULT_LAYOUT',
  CHECKIN_POPUP_TIMEOUT_MS: 'CHECKIN_POPUP_TIMEOUT_MS',
  ALERT_SOUND_ENABLED: 'ALERT_SOUND_ENABLED',
  BACKUP_ENABLED: 'BACKUP_ENABLED',
  BACKUP_CRON: 'BACKUP_CRON',
  BACKUP_RETENTION_DAYS: 'BACKUP_RETENTION_DAYS',
  AKUVOX_WEBHOOK_TOKEN: 'AKUVOX_WEBHOOK_TOKEN',
  AKUVOX_ALLOWED_IPS: 'AKUVOX_ALLOWED_IPS',
  AKUVOX_MOCK_MODE: 'AKUVOX_MOCK_MODE',
} as const;

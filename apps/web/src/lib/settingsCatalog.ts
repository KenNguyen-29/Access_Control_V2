import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Clock,
  HardDrive,
  KeyRound,
  LayoutGrid,
  MapPin,
  Shield,
  Users,
} from 'lucide-react';

export type SettingsSectionId = 'general' | 'hr' | 'access' | 'shifts' | 'data';

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
    label: 'Dữ liệu',
    items: [
      {
        id: 'storage',
        path: '/settings/storage',
        icon: HardDrive,
        title: 'Lưu trữ',
        description: 'Thời gian giữ log & snapshot',
      },
    ],
  },
];

export const SETTINGS_NAV: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'general', label: 'Chung' },
  ...SETTINGS_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
];

export function getSectionLinks(sectionId: SettingsSectionId): SettingsLinkItem[] {
  if (sectionId === 'general') return [];
  return SETTINGS_SECTIONS.find((s) => s.id === sectionId)?.items ?? [];
}

export const SETTING_KEYS = {
  DATE_FORMAT: 'DATE_FORMAT',
  AUTO_LOGOUT_ENABLED: 'AUTO_LOGOUT_ENABLED',
  LOG_RETENTION_DAYS: 'LOG_RETENTION_DAYS',
  STORAGE_RETENTION_DAYS: 'STORAGE_RETENTION_DAYS',
} as const;

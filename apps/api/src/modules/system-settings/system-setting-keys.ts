export const ACCESS_ZONE_SCHEDULES_KEY = 'ACCESS_ZONE_SCHEDULES_JSON';

export const SETTING_KEY = {
  DEFAULT_WORK_SHIFT_ID: 'default_work_shift_id',
  EMERGENCY_MODE: 'EMERGENCY_MODE',
  ACCESS_ZONE_SCHEDULES_JSON: ACCESS_ZONE_SCHEDULES_KEY,
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

export type SettingKey = (typeof SETTING_KEY)[keyof typeof SETTING_KEY];

export type SettingValueKind = 'string' | 'boolean' | 'int' | 'float' | 'enum' | 'cron' | 'secret' | 'json';

export type SettingRule = {
  kind: SettingValueKind;
  defaultValue: string;
  /** When true, GET responses mask the stored value. */
  secret?: boolean;
  min?: number;
  max?: number;
  enumValues?: readonly string[];
};

const CAMERA_LAYOUTS = ['1', '4', '6', '9', '16'] as const;

export const SETTING_RULES: Record<string, SettingRule> = {
  [SETTING_KEY.DEFAULT_WORK_SHIFT_ID]: { kind: 'string', defaultValue: '' },
  [SETTING_KEY.EMERGENCY_MODE]: {
    kind: 'enum',
    defaultValue: 'FALSE',
    enumValues: ['TRUE', 'FALSE'],
  },
  [SETTING_KEY.ACCESS_ZONE_SCHEDULES_JSON]: {
    kind: 'json',
    defaultValue: JSON.stringify({ schedules: {} }),
  },
  [SETTING_KEY.DATE_FORMAT]: {
    kind: 'enum',
    defaultValue: 'DD/MM/YYYY',
    enumValues: ['DD/MM/YYYY', 'dd/MM/yyyy', 'yyyy/MM/dd', 'YYYY/MM/DD'],
  },
  [SETTING_KEY.AUTO_LOGOUT_ENABLED]: { kind: 'boolean', defaultValue: 'false' },
  [SETTING_KEY.LOG_RETENTION_DAYS]: { kind: 'int', defaultValue: '90', min: 1, max: 3650 },
  [SETTING_KEY.STORAGE_RETENTION_DAYS]: { kind: 'int', defaultValue: '30', min: 1, max: 3650 },
  [SETTING_KEY.ATTENDANCE_RETENTION_DAYS]: { kind: 'int', defaultValue: '90', min: 60, max: 90 },
  [SETTING_KEY.ATTENDANCE_LATE_GRACE_MINUTES]: { kind: 'int', defaultValue: '5', min: 0, max: 120 },
  [SETTING_KEY.ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES]: {
    kind: 'int',
    defaultValue: '5',
    min: 0,
    max: 120,
  },
  [SETTING_KEY.PUNCH_COOLDOWN_MINUTES]: { kind: 'int', defaultValue: '5', min: 0, max: 120 },
  [SETTING_KEY.OT_AFTER_MINUTES]: { kind: 'int', defaultValue: '0', min: 0, max: 240 },
  [SETTING_KEY.OT_MULTIPLIER]: { kind: 'float', defaultValue: '1.25', min: 1, max: 3 },
  [SETTING_KEY.CAMERA_DEFAULT_LAYOUT]: {
    kind: 'enum',
    defaultValue: '4',
    enumValues: CAMERA_LAYOUTS,
  },
  [SETTING_KEY.CHECKIN_POPUP_TIMEOUT_MS]: {
    kind: 'int',
    defaultValue: '6000',
    min: 1000,
    max: 60000,
  },
  [SETTING_KEY.ALERT_SOUND_ENABLED]: { kind: 'boolean', defaultValue: 'false' },
  [SETTING_KEY.BACKUP_ENABLED]: { kind: 'boolean', defaultValue: 'false' },
  [SETTING_KEY.BACKUP_CRON]: { kind: 'cron', defaultValue: '0 2 * * *' },
  [SETTING_KEY.BACKUP_RETENTION_DAYS]: { kind: 'int', defaultValue: '14', min: 1, max: 365 },
  [SETTING_KEY.AKUVOX_WEBHOOK_TOKEN]: { kind: 'secret', defaultValue: '', secret: true },
  [SETTING_KEY.AKUVOX_ALLOWED_IPS]: { kind: 'string', defaultValue: '' },
  [SETTING_KEY.AKUVOX_MOCK_MODE]: { kind: 'boolean', defaultValue: 'false' },
};

export const ALLOWED_SETTING_KEYS = new Set(Object.keys(SETTING_RULES));

export const MODULE5_SEED_SETTINGS: Array<{ key: string; value: string }> = [
  { key: SETTING_KEY.EMERGENCY_MODE, value: 'FALSE' },
  {
    key: SETTING_KEY.ACCESS_ZONE_SCHEDULES_JSON,
    value: JSON.stringify({ schedules: {} }),
  },
  { key: SETTING_KEY.DATE_FORMAT, value: 'DD/MM/YYYY' },
  { key: SETTING_KEY.AUTO_LOGOUT_ENABLED, value: 'false' },
  { key: SETTING_KEY.LOG_RETENTION_DAYS, value: '90' },
  { key: SETTING_KEY.STORAGE_RETENTION_DAYS, value: '30' },
  { key: SETTING_KEY.ATTENDANCE_RETENTION_DAYS, value: '90' },
  { key: SETTING_KEY.ATTENDANCE_LATE_GRACE_MINUTES, value: '5' },
  { key: SETTING_KEY.ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES, value: '5' },
  { key: SETTING_KEY.PUNCH_COOLDOWN_MINUTES, value: '5' },
  { key: SETTING_KEY.OT_AFTER_MINUTES, value: '0' },
  { key: SETTING_KEY.OT_MULTIPLIER, value: '1.25' },
  { key: SETTING_KEY.CAMERA_DEFAULT_LAYOUT, value: '4' },
  { key: SETTING_KEY.CHECKIN_POPUP_TIMEOUT_MS, value: '6000' },
  { key: SETTING_KEY.ALERT_SOUND_ENABLED, value: 'false' },
  { key: SETTING_KEY.BACKUP_ENABLED, value: 'false' },
  { key: SETTING_KEY.BACKUP_CRON, value: '0 2 * * *' },
  { key: SETTING_KEY.BACKUP_RETENTION_DAYS, value: '14' },
  { key: SETTING_KEY.AKUVOX_WEBHOOK_TOKEN, value: '' },
  { key: SETTING_KEY.AKUVOX_ALLOWED_IPS, value: '' },
  { key: SETTING_KEY.AKUVOX_MOCK_MODE, value: 'false' },
];

const CRON_RE =
  /^(\*|([0-9]|[1-5][0-9])|\*\/([0-9]|[1-5][0-9]))\s+(\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3]))\s+(\*|([1-9]|[12][0-9]|3[01])|\*\/([1-9]|[12][0-9]|3[01]))\s+(\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2]))\s+(\*|([0-6])|\*\/([0-6]))$/;

export function maskSecret(value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (v.length <= 4) return '****';
  return `****${v.slice(-4)}`;
}

export function isMaskedSecretInput(value: string): boolean {
  return value.trim().startsWith('****');
}

export function validateSettingValue(key: string, raw: string): string {
  const rule = SETTING_RULES[key];
  if (!rule) {
    throw new Error(`Unknown setting key: ${key}`);
  }

  const value = raw.trim();

  switch (rule.kind) {
    case 'boolean': {
      const lower = value.toLowerCase();
      if (lower !== 'true' && lower !== 'false') {
        throw new Error(`${key} phải là true hoặc false`);
      }
      return lower;
    }
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new Error(`${key} phải là số nguyên`);
      if (rule.min != null && n < rule.min) throw new Error(`${key} tối thiểu ${rule.min}`);
      if (rule.max != null && n > rule.max) throw new Error(`${key} tối đa ${rule.max}`);
      return String(n);
    }
    case 'float': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${key} phải là số`);
      if (rule.min != null && n < rule.min) throw new Error(`${key} tối thiểu ${rule.min}`);
      if (rule.max != null && n > rule.max) throw new Error(`${key} tối đa ${rule.max}`);
      return String(n);
    }
    case 'enum': {
      if (!rule.enumValues?.includes(value)) {
        throw new Error(`${key} không hợp lệ`);
      }
      return value;
    }
    case 'cron': {
      if (!CRON_RE.test(value)) {
        throw new Error(`${key} không đúng định dạng cron (phút giờ ngày tháng thứ)`);
      }
      return value;
    }
    case 'json': {
      try {
        JSON.parse(value);
      } catch {
        throw new Error(`${key} phải là JSON hợp lệ`);
      }
      return value;
    }
    case 'secret':
    case 'string':
    default:
      return value;
  }
}

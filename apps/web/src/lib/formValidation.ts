/** Shared client-side form validation helpers used across admin screens. */

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export function hasFormErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function clearFieldError<T extends string>(
  prev: FieldErrors<T>,
  keys: T | T[],
): FieldErrors<T> {
  const next = { ...prev };
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    delete next[key];
  }
  return next;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
/** VN mobile: 0[35789]xxxxxxxx or +84/84[35789]xxxxxxxx */
const VN_PHONE_RE = /^(0|\+84|84)(3|5|7|8|9)\d{8}$/;
const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RTSP_RE = /^rtsps?:\/\/.+/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse YYYY-MM-DD as local calendar date; rejects impossible dates (e.g. 2026-02-31). */
export function parseIsoDateLocal(raw: string): Date | null {
  const text = raw.trim();
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(y, month - 1, day);
  if (dt.getFullYear() !== y || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return dt;
}

export function isValidIsoDate(raw: string): boolean {
  return parseIsoDateLocal(raw) !== null;
}

/** Negative if a < b, 0 if equal, positive if a > b; null if either invalid. */
export function compareIsoDates(a: string, b: string): number | null {
  const da = parseIsoDateLocal(a);
  const db = parseIsoDateLocal(b);
  if (!da || !db) return null;
  return da.getTime() - db.getTime();
}

/** Validate from/to range. `endRequired` forces end date to be filled. */
export function validateDateRange(
  start: string,
  end: string,
  options?: {
    startLabel?: string;
    endLabel?: string;
    endRequired?: boolean;
    allowEqual?: boolean;
  },
): FieldErrors<'startDate' | 'endDate'> {
  const startLabel = options?.startLabel ?? 'ngày bắt đầu';
  const endLabel = options?.endLabel ?? 'ngày kết thúc';
  const allowEqual = options?.allowEqual !== false;
  const errors: FieldErrors<'startDate' | 'endDate'> = {};

  if (!start.trim()) {
    errors.startDate = `Vui lòng chọn ${startLabel}`;
  } else if (!isValidIsoDate(start)) {
    errors.startDate = `${startLabel} không hợp lệ`;
  }

  if (!end.trim()) {
    if (options?.endRequired) {
      errors.endDate = `Vui lòng chọn ${endLabel}`;
    }
  } else if (!isValidIsoDate(end)) {
    errors.endDate = `${endLabel} không hợp lệ`;
  }

  if (!errors.startDate && !errors.endDate && start.trim() && end.trim()) {
    const cmp = compareIsoDates(end, start);
    if (cmp === null) {
      errors.endDate = `${endLabel} không hợp lệ`;
    } else if (cmp < 0 || (!allowEqual && cmp === 0)) {
      errors.endDate = allowEqual
        ? `${endLabel} phải sau hoặc bằng ${startLabel}`
        : `${endLabel} phải sau ${startLabel}`;
    }
  }

  return errors;
}

export function isValidRtspUrl(raw: string): boolean {
  return RTSP_RE.test(raw.trim());
}

export function requireTrimmed(value: string, label: string, min = 1, max = 200): string | undefined {
  const v = value.trim();
  if (!v) return `Vui lòng nhập ${label}`;
  if (v.length < min) return `${label} tối thiểu ${min} ký tự`;
  if (v.length > max) return `${label} tối đa ${max} ký tự`;
  return undefined;
}

export function isValidEmail(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (v.length > 254) return false;
  return EMAIL_RE.test(v);
}

export function isValidVnPhone(raw: string): boolean {
  const v = normalizePhone(raw.trim());
  if (!v) return false;
  return VN_PHONE_RE.test(v);
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s.\-()]/g, '');
}

export function isValidIpv4(raw: string): boolean {
  return IPV4_RE.test(raw.trim());
}

export function isValidCode(raw: string): boolean {
  return CODE_RE.test(raw.trim());
}

export function isValidHhMm(raw: string): boolean {
  return HH_MM_RE.test(raw.trim());
}

// ─── User / employee ───────────────────────────────────────────────

export type UserFormFields = {
  fullName: string;
  email: string;
  phone: string;
  departmentId?: string;
};

export type UserFormFieldErrors = FieldErrors<keyof UserFormFields>;

export function validateUserForm(form: UserFormFields): UserFormFieldErrors {
  const errors: UserFormFieldErrors = {};
  const fullNameErr = requireTrimmed(form.fullName, 'họ tên', 2, 100);
  if (fullNameErr) errors.fullName = fullNameErr;

  const email = form.email.trim();
  if (!email) errors.email = 'Vui lòng nhập email';
  else if (!isValidEmail(email)) errors.email = 'Email không đúng định dạng (vd. ten@congty.com)';

  const phone = form.phone.trim();
  if (!phone) errors.phone = 'Vui lòng nhập số điện thoại';
  else if (!isValidVnPhone(phone)) {
    errors.phone = 'SĐT không đúng (vd. 0912345678 hoặc +84912345678)';
  }

  return errors;
}

/** @deprecated use hasFormErrors */
export const hasUserFormErrors = hasFormErrors;

// ─── Device ────────────────────────────────────────────────────────

export type DeviceFormFields = {
  name: string;
  code: string;
  deviceType: 'AKUVOX' | 'CAMERA';
  zoneId: string;
  ipAddress: string;
  location: string;
  rtspUrl: string;
  username: string;
  password: string;
  /** When editing, blank password keeps existing */
  isEdit?: boolean;
  hasExistingPassword?: boolean;
};

export type DeviceFormFieldErrors = FieldErrors<keyof DeviceFormFields>;

export function validateDeviceForm(form: DeviceFormFields): DeviceFormFieldErrors {
  const errors: DeviceFormFieldErrors = {};
  const nameErr = requireTrimmed(form.name, 'tên thiết bị', 2, 100);
  if (nameErr) errors.name = nameErr;

  const code = form.code.trim();
  if (!code) errors.code = 'Vui lòng nhập mã thiết bị';
  else if (!isValidCode(code)) {
    errors.code = 'Mã chỉ gồm chữ/số/_/- (tối đa 32 ký tự)';
  }

  if (form.deviceType === 'AKUVOX' && !form.zoneId.trim()) {
    errors.zoneId = 'Vui lòng chọn khu vực cho Akuvox';
  }

  const ip = form.ipAddress.trim();
  if (!ip) {
    errors.ipAddress = 'Vui lòng nhập địa chỉ IP';
  } else if (!isValidIpv4(ip)) {
    errors.ipAddress = 'IP không đúng định dạng (vd. 192.168.1.10)';
  }

  if (form.deviceType === 'CAMERA') {
    const rtsp = form.rtspUrl.trim();
    if (!rtsp) errors.rtspUrl = 'Vui lòng nhập RTSP URL';
    else if (!isValidRtspUrl(rtsp)) errors.rtspUrl = 'RTSP URL phải bắt đầu bằng rtsp:// hoặc rtsps://';
  }

  if (!form.username.trim()) {
    errors.username = 'Vui lòng nhập tài khoản';
  }

  const needsPassword = !form.isEdit || !form.hasExistingPassword;
  if (needsPassword && !form.password.trim()) {
    errors.password = 'Vui lòng nhập mật khẩu';
  }

  return errors;
}

export type DeviceMappingFields = {
  akuvoxDeviceId: string;
  cameraDeviceId: string;
};

export function validateDeviceMappingForm(form: DeviceMappingFields): FieldErrors<keyof DeviceMappingFields> {
  const errors: FieldErrors<keyof DeviceMappingFields> = {};
  if (!form.akuvoxDeviceId.trim()) errors.akuvoxDeviceId = 'Vui lòng chọn đầu đọc Akuvox';
  if (!form.cameraDeviceId.trim()) errors.cameraDeviceId = 'Vui lòng chọn camera';
  if (
    form.akuvoxDeviceId &&
    form.cameraDeviceId &&
    form.akuvoxDeviceId === form.cameraDeviceId
  ) {
    errors.cameraDeviceId = 'Camera phải khác thiết bị Akuvox';
  }
  return errors;
}

// ─── Department / Zone ─────────────────────────────────────────────

export type DepartmentFormFields = { code: string; name: string; description: string };
export type ZoneFormFields = { name: string; parentZoneId: string; description: string };

export function validateDepartmentForm(form: DepartmentFormFields): FieldErrors<keyof DepartmentFormFields> {
  const errors: FieldErrors<keyof DepartmentFormFields> = {};
  const code = form.code.trim();
  if (!code) errors.code = 'Vui lòng nhập mã phòng ban';
  else if (!isValidCode(code)) errors.code = 'Mã chỉ gồm chữ/số/_/- (tối đa 32 ký tự)';

  const nameErr = requireTrimmed(form.name, 'tên phòng ban', 2, 100);
  if (nameErr) errors.name = nameErr;

  if (form.description.trim().length > 500) {
    errors.description = 'Mô tả tối đa 500 ký tự';
  }
  return errors;
}

export function validateZoneForm(form: ZoneFormFields): FieldErrors<keyof ZoneFormFields> {
  const errors: FieldErrors<keyof ZoneFormFields> = {};
  const nameErr = requireTrimmed(form.name, 'tên khu vực', 2, 100);
  if (nameErr) errors.name = nameErr;
  if (form.description.trim().length > 500) {
    errors.description = 'Mô tả tối đa 500 ký tự';
  }
  return errors;
}

// ─── Shifts ────────────────────────────────────────────────────────

import { findOverlappingShift, type ShiftTimeWindow } from './shiftTime';

export type WorkShiftFormFields = {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number | string;
  salaryCoefficient: number | string;
  isOvernight?: boolean;
};

export function validateWorkShiftForm(
  form: WorkShiftFormFields,
  options?: { existingShifts?: ShiftTimeWindow[]; excludeId?: string },
): FieldErrors<keyof WorkShiftFormFields> {
  const errors: FieldErrors<keyof WorkShiftFormFields> = {};
  const nameErr = requireTrimmed(form.name, 'tên ca', 2, 100);
  if (nameErr) errors.name = nameErr;

  const code = form.code.trim();
  if (!code) errors.code = 'Vui lòng nhập mã ca';
  else if (!isValidCode(code)) errors.code = 'Mã chỉ gồm chữ/số/_/- (tối đa 32 ký tự)';

  if (!form.startTime.trim()) errors.startTime = 'Vui lòng nhập giờ bắt đầu';
  else if (!isValidHhMm(form.startTime)) errors.startTime = 'Định dạng HH:mm (vd. 08:00)';

  if (!form.endTime.trim()) errors.endTime = 'Vui lòng nhập giờ kết thúc';
  else if (!isValidHhMm(form.endTime)) errors.endTime = 'Định dạng HH:mm (vd. 17:00)';

  if (!errors.startTime && !errors.endTime) {
    const start = form.startTime.trim();
    const end = form.endTime.trim();
    const overnight = Boolean(form.isOvernight) || end <= start;
    if (!overnight && start === end) {
      errors.endTime = 'Giờ kết thúc phải khác giờ bắt đầu';
    } else {
      const overlap = findOverlappingShift(
        { startTime: start, endTime: end, isOvernight: overnight },
        options?.existingShifts ?? [],
        options?.excludeId,
      );
      if (overlap) {
        const label = overlap.name || overlap.code || 'ca khác';
        errors.startTime = `Khung giờ trùng với ca "${label}" (${overlap.startTime}–${overlap.endTime})`;
        errors.endTime = `Mỗi ca phải có khung giờ riêng, không chồng lên ca khác`;
      }
    }
  }

  const breakMins = Number(form.breakMinutes);
  if (!Number.isFinite(breakMins) || breakMins < 0 || breakMins > 24 * 60) {
    errors.breakMinutes = 'Phút nghỉ phải từ 0 trở lên';
  }

  const coef = Number(form.salaryCoefficient);
  if (!Number.isFinite(coef) || coef <= 0 || coef > 10) {
    errors.salaryCoefficient = 'Hệ số lương phải > 0 và ≤ 10';
  }

  return errors;
}

export type AssignShiftMode = 'FIXED' | 'RANGED';

export type AssignShiftFormFields = {
  workShiftId: string;
  startDate: string;
  endDate: string;
  selectedCount: number;
  mode?: AssignShiftMode;
};

export function validateAssignShiftForm(
  form: AssignShiftFormFields,
): FieldErrors<'workShiftId' | 'startDate' | 'endDate' | 'selectedUserIds' | 'mode'> {
  const errors: FieldErrors<'workShiftId' | 'startDate' | 'endDate' | 'selectedUserIds' | 'mode'> =
    {};
  if (!form.workShiftId.trim()) errors.workShiftId = 'Vui lòng chọn ca làm việc';
  if (form.selectedCount < 1) errors.selectedUserIds = 'Chọn ít nhất một nhân viên';

  const mode = form.mode ?? 'RANGED';
  if (mode === 'RANGED') {
    const rangeErrors = validateDateRange(form.startDate, form.endDate, {
      startLabel: 'ngày bắt đầu',
      endLabel: 'ngày kết thúc',
      endRequired: true,
      allowEqual: true,
    });
    if (rangeErrors.startDate) errors.startDate = rangeErrors.startDate;
    if (rangeErrors.endDate) errors.endDate = rangeErrors.endDate;
  }

  return errors;
}

/** Filter range: from ≤ to (both required). */
export function validateFilterDateRange(
  from: string,
  to: string,
): FieldErrors<'from' | 'to'> {
  const range = validateDateRange(from, to, {
    startLabel: 'từ ngày',
    endLabel: 'đến ngày',
    endRequired: true,
    allowEqual: true,
  });
  return {
    ...(range.startDate ? { from: range.startDate } : {}),
    ...(range.endDate ? { to: range.endDate } : {}),
  };
}

// ─── Access group / login / storage ────────────────────────────────

export function validateAccessGroupForm(form: {
  name: string;
  scheduleTemplate: string;
}): FieldErrors<'name' | 'scheduleTemplate'> {
  const errors: FieldErrors<'name' | 'scheduleTemplate'> = {};
  const nameErr = requireTrimmed(form.name, 'tên nhóm', 2, 100);
  if (nameErr) errors.name = nameErr;
  if (!form.scheduleTemplate.trim()) errors.scheduleTemplate = 'Vui lòng chọn lịch làm việc';
  return errors;
}

export function validateLoginForm(form: {
  username: string;
  password: string;
}): FieldErrors<'username' | 'password'> {
  const errors: FieldErrors<'username' | 'password'> = {};
  if (!form.username.trim()) errors.username = 'Vui lòng nhập tên đăng nhập';
  if (!form.password) errors.password = 'Vui lòng nhập mật khẩu';
  else if (form.password.length < 4) errors.password = 'Mật khẩu tối thiểu 4 ký tự';
  return errors;
}

export function validateRetentionDays(value: string): string | undefined {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n)) return 'Vui lòng nhập số ngày';
  if (!Number.isInteger(n) || n < 1) return 'Số ngày phải là số nguyên ≥ 1';
  if (n > 3650) return 'Số ngày tối đa 3650';
  return undefined;
}

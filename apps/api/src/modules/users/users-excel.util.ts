import * as ExcelJS from 'exceljs';
import {
  cellToString,
  normalizeHeader,
  sendXlsx,
  workbookToBuffer,
} from '../attendance/attendance-excel.util';

export { cellToString, normalizeHeader, sendXlsx, workbookToBuffer };

/** Shared Excel columns for users template / import. Mã NV is auto-generated — not in template. */
export const USER_EXCEL_COLUMNS = [
  { header: 'Họ tên', key: 'fullName', width: 24 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Số điện thoại', key: 'phone', width: 16 },
  { header: 'CCCD', key: 'citizenId', width: 16 },
  { header: 'Phòng ban', key: 'department', width: 22 },
  { header: 'Nhà thầu', key: 'contractor', width: 22 },
  { header: 'Dự án', key: 'project', width: 22 },
  { header: 'Loại NV', key: 'userType', width: 14 },
  { header: 'Ảnh', key: 'faceImage', width: 28 },
  { header: 'Khu vực', key: 'zones', width: 36 },
] as const;

export type UserExcelColumnKey = (typeof USER_EXCEL_COLUMNS)[number]['key'];

export const USER_HEADER_ALIASES: Record<UserExcelColumnKey, string[]> = {
  fullName: ['ho ten', 'full name', 'fullname', 'name'],
  email: ['email', 'e-mail', 'thu dien tu'],
  phone: ['so dien thoai', 'sdt', 'phone', 'dien thoai', 'mobile'],
  citizenId: ['cccd', 'cmnd', 'citizen id', 'citizenid', 'so cccd'],
  department: ['phong ban', 'department', 'bo phan', 'dept'],
  contractor: ['nha thau', 'contractor', 'thau', 'nhà thầu'],
  project: ['du an', 'project', 'cong trinh', 'dự án'],
  userType: ['loai nv', 'loai', 'user type', 'usertype', 'type'],
  faceImage: [
    'anh',
    'anh face',
    'anh faceid',
    'face',
    'face image',
    'faceimage',
    'photo',
    'hinh anh',
    'image',
  ],
  zones: [
    'khu vuc',
    'khu vuc ra vao',
    'zones',
    'zone',
    'access zones',
    'access zone',
    'khu',
  ],
};

export function createUsersWorkbook(sheetName = 'Nhân sự'): {
  workbook: ExcelJS.Workbook;
  sheet: ExcelJS.Worksheet;
} {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = USER_EXCEL_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  sheet.getRow(1).font = { bold: true };
  return { workbook, sheet };
}

export function mapUserHeaderRow(
  headerRow: ExcelJS.Row,
): Partial<Record<UserExcelColumnKey, number>> {
  const map: Partial<Record<UserExcelColumnKey, number>> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeHeader(cell.value);
    for (const [key, aliases] of Object.entries(USER_HEADER_ALIASES) as Array<
      [UserExcelColumnKey, string[]]
    >) {
      if (aliases.includes(normalized) && map[key] == null) {
        map[key] = colNumber;
        break;
      }
    }
  });
  return map;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const VN_PHONE_RE = /^(0|\+84|84)(3|5|7|8|9)\d{8}$/;

export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s.\-()]/g, '');
}

/**
 * Lookup key for Vietnamese entity names in Excel import.
 * Unifies old vs new tone placement on diphthongs (Hoà ↔ Hòa, thuỷ ↔ thủy).
 */
export function normalizeVnNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/oà/g, 'òa')
    .replace(/oá/g, 'óa')
    .replace(/oả/g, 'ỏa')
    .replace(/oã/g, 'õa')
    .replace(/oạ/g, 'ọa')
    .replace(/oè/g, 'èo')
    .replace(/oé/g, 'éo')
    .replace(/oẻ/g, 'ẻo')
    .replace(/oẽ/g, 'ẽo')
    .replace(/oẹ/g, 'ẹo')
    .replace(/uỳ/g, 'ùy')
    .replace(/uý/g, 'úy')
    .replace(/uỷ/g, 'ủy')
    .replace(/uỹ/g, 'ũy')
    .replace(/uỵ/g, 'ụy');
}

/** Index both raw lowercase and VN-normalized keys → same id. */
export function indexVnName(map: Map<string, string>, name: string, id: string) {
  const raw = name.trim().toLowerCase();
  const key = normalizeVnNameKey(name);
  if (raw) map.set(raw, id);
  if (key) map.set(key, id);
}

export function isValidImportEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

export function isValidImportPhone(raw: string): boolean {
  return VN_PHONE_RE.test(normalizePhone(raw));
}

export function parseUserType(raw: string): 'EMPLOYEE' | 'VISITOR' | 'CONTRACTOR' | null {
  if (!raw.trim()) return null;
  const upper = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if (upper === 'EMPLOYEE' || upper === 'NV' || upper === 'NHAN_VIEN') return 'EMPLOYEE';
  if (upper === 'VISITOR' || upper === 'KHACH') return 'VISITOR';
  if (upper === 'CONTRACTOR' || upper === 'THAU_PHU' || upper === 'CONG_TAC_VIEN') {
    return 'CONTRACTOR';
  }
  return null;
}

/** Split "Cổng chính; Văn phòng" or comma-separated zone names. */
export function parseZoneNames(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isHttpUrl(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

export function basenamePath(raw: string): string {
  const cleaned = raw.trim().replace(/\\/g, '/');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || cleaned;
}

/** Match Excel "Ảnh" cell (filename or folder/file.jpg) against ZIP image index. */
export function lookupZipImage(zipImages: Map<string, Buffer>, faceRaw: string): Buffer | null {
  const trimmed = faceRaw.trim().replace(/\\/g, '/');
  if (!trimmed) return null;
  const base = basenamePath(trimmed).toLowerCase();
  return zipImages.get(base) ?? zipImages.get(trimmed.toLowerCase()) ?? null;
}

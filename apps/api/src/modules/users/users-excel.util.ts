import * as ExcelJS from 'exceljs';
import {
  cellToString,
  normalizeHeader,
  sendXlsx,
  workbookToBuffer,
} from '../attendance/attendance-excel.util';

export { cellToString, normalizeHeader, sendXlsx, workbookToBuffer };

/** Shared Excel columns for users template / import. */
export const USER_EXCEL_COLUMNS = [
  { header: 'Mã NV', key: 'employeeCode', width: 14 },
  { header: 'Họ tên', key: 'fullName', width: 24 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Số điện thoại', key: 'phone', width: 16 },
  { header: 'Phòng ban', key: 'department', width: 22 },
  { header: 'Loại NV', key: 'userType', width: 14 },
  { header: 'Ảnh', key: 'faceImage', width: 28 },
  { header: 'Khu vực', key: 'zones', width: 36 },
] as const;

export type UserExcelColumnKey = (typeof USER_EXCEL_COLUMNS)[number]['key'];

export const USER_HEADER_ALIASES: Record<UserExcelColumnKey, string[]> = {
  employeeCode: ['ma nv', 'employee code', 'employeecode', 'ma nhan vien'],
  fullName: ['ho ten', 'full name', 'fullname', 'name'],
  email: ['email', 'e-mail', 'thu dien tu'],
  phone: ['so dien thoai', 'sdt', 'phone', 'dien thoai', 'mobile'],
  department: ['phong ban', 'department', 'bo phan', 'dept'],
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

/**
 * Map worksheet embedded images to Excel row numbers (1-based).
 * Uses image anchor nativeRow (0-based) when available.
 * Prefer images whose left column is near the "Ảnh" column when provided.
 */
export function mapEmbeddedImagesByRow(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  preferCol?: number,
): Map<number, Buffer> {
  const byRow = new Map<number, Buffer>();
  const images = sheet.getImages?.() ?? [];
  type Cand = { row: number; col: number; buf: Buffer };
  const cands: Cand[] = [];

  for (const img of images) {
    try {
      const media = workbook.getImage(Number(img.imageId));
      const buf = Buffer.isBuffer(media.buffer)
        ? media.buffer
        : Buffer.from(media.buffer as ArrayBuffer);
      const tl = img.range?.tl as
        | { nativeRow?: number; nativeCol?: number; row?: number; col?: number }
        | undefined;
      const row =
        typeof tl?.nativeRow === 'number'
          ? tl.nativeRow + 1
          : typeof tl?.row === 'number'
            ? Math.floor(tl.row) + 1
            : null;
      const col =
        typeof tl?.nativeCol === 'number'
          ? tl.nativeCol + 1
          : typeof tl?.col === 'number'
            ? Math.floor(tl.col) + 1
            : 0;
      if (row != null && buf.length > 0) {
        cands.push({ row, col, buf });
      }
    } catch {
      /* skip broken media */
    }
  }

  // Prefer images closest to the face column; otherwise first per row
  cands.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (preferCol) {
      return Math.abs(a.col - preferCol) - Math.abs(b.col - preferCol);
    }
    return a.col - b.col;
  });
  for (const c of cands) {
    if (!byRow.has(c.row)) byRow.set(c.row, c.buf);
  }
  return byRow;
}

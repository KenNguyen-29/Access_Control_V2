import * as ExcelJS from 'exceljs';

/** Shared Excel columns for attendance export / template / import. */
export const ATTENDANCE_EXCEL_COLUMNS = [
  { header: 'Mã NV', key: 'employeeCode', width: 14 },
  { header: 'Họ tên', key: 'fullName', width: 24 },
  { header: 'Ngày', key: 'date', width: 14 },
  { header: 'Ca', key: 'shift', width: 18 },
  { header: 'Giờ vào', key: 'checkIn', width: 18 },
  { header: 'Giờ ra', key: 'checkOut', width: 18 },
  { header: 'Trạng thái', key: 'status', width: 14 },
  { header: 'Muộn (phút)', key: 'late', width: 12 },
  { header: 'Về sớm (phút)', key: 'early', width: 14 },
  { header: 'OT (phút)', key: 'ot', width: 12 },
] as const;

export type AttendanceExcelColumnKey = (typeof ATTENDANCE_EXCEL_COLUMNS)[number]['key'];

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatLocalDateTime(d: Date): string {
  const date = formatLocalDate(d);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

/** Parse YYYY-MM-DD as local calendar date at midnight. */
export function parseLocalDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm", or Date-like Excel values. */
export function parseLocalDateTime(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (days since 1899-12-30)
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + value * 86400000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;

  const isoLocal = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (isoLocal) {
    const d = new Date(
      Number(isoLocal[1]),
      Number(isoLocal[2]) - 1,
      Number(isoLocal[3]),
      Number(isoLocal[4]),
      Number(isoLocal[5]),
      isoLocal[6] ? Number(isoLocal[6]) : 0,
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dateOnly = parseLocalDateOnly(s);
  if (dateOnly) return dateOnly;

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return formatLocalDateTime(value);
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellToString((value as { result: unknown }).result);
  }
  return String(value).trim();
}

export function cellToNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

export function createAttendanceWorkbook(sheetName = 'Chấm công'): {
  workbook: ExcelJS.Workbook;
  sheet: ExcelJS.Worksheet;
} {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = ATTENDANCE_EXCEL_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  sheet.getRow(1).font = { bold: true };
  return { workbook, sheet };
}

export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function sendXlsx(res: {
  setHeader: (k: string, v: string) => void;
  send: (b: Buffer) => void;
}, buffer: Buffer, filename: string) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

/** Normalize header cell for flexible matching (accents / case). */
export function normalizeHeader(value: unknown): string {
  return cellToString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const ATTENDANCE_HEADER_ALIASES: Record<AttendanceExcelColumnKey, string[]> = {
  employeeCode: ['ma nv', 'employee code', 'employeeCode'],
  fullName: ['ho ten', 'full name', 'fullName'],
  date: ['ngay', 'date'],
  shift: ['ca', 'shift'],
  checkIn: ['gio vao', 'check in', 'checkIn'],
  checkOut: ['gio ra', 'check out', 'checkOut'],
  status: ['trang thai', 'status'],
  late: ['muon (phut)', 'muon', 'late (min)', 'late'],
  early: ['ve som (phut)', 've som', 'early leave (min)', 'early'],
  ot: ['ot (phut)', 'ot'],
};

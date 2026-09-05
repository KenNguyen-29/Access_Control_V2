/** Shared labels: chấm công vs lượt ra/vào (Người lạ only when no matched user). */

export function isMovementOnlyWarning(warning?: string | null): boolean {
  if (!warning) return false;
  const w = warning.toLowerCase();
  return w.includes('không tính thêm') || w.includes('lượt ra vào');
}

/**
 * Hành động hiển thị:
 * - Chấm vào / Chấm ra = lần tính công (attendance)
 * - Lượt vào / Lượt ra = sau khi đã chấm xong ngày, chỉ ghi log
 */
export function accessLogActionLabel(
  action?: string | null,
  opts?: { hasUser?: boolean; warningMessage?: string | null },
): string {
  const movement = isMovementOnlyWarning(opts?.warningMessage);
  if (action === 'CHECK_IN') return movement ? 'Lượt vào' : 'Chấm vào';
  if (action === 'CHECK_OUT') return movement ? 'Lượt ra' : 'Chấm ra';
  if (action === 'DENIED') return 'Từ chối';
  if (action === 'FIRE_EMERGENCY') return 'Khẩn cấp';
  if (action === 'UNKNOWN') {
    return opts?.hasUser ? 'Sự kiện' : 'Người lạ';
  }
  return action || '—';
}

export function accessLogKindLabel(opts: {
  action?: string | null;
  isValid?: boolean;
  warningMessage?: string | null;
  hasUser?: boolean;
}): { kind: 'attendance' | 'movement' | 'warning' | 'stranger' | 'other'; label: string } {
  if (opts.isValid === false || (!opts.hasUser && opts.action === 'UNKNOWN')) {
    return { kind: opts.hasUser ? 'warning' : 'stranger', label: opts.hasUser ? 'Cảnh báo' : 'Người lạ' };
  }
  if (isMovementOnlyWarning(opts.warningMessage)) {
    return { kind: 'movement', label: 'Ra vào' };
  }
  if (opts.warningMessage) {
    return { kind: 'other', label: 'Chưa tính' };
  }
  if (opts.action === 'CHECK_IN' || opts.action === 'CHECK_OUT') {
    return { kind: 'attendance', label: 'Chấm công' };
  }
  return { kind: 'other', label: 'Hợp lệ' };
}

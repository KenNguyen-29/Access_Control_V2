/** Shared labels for access-log actions (Người lạ only when no matched user). */

export function isMovementOnlyWarning(warning?: string | null): boolean {
  if (!warning) return false;
  const w = warning.toLowerCase();
  return w.includes('không tính thêm') || w.includes('lượt ra vào');
}

export function accessLogActionLabel(
  action?: string | null,
  opts?: { hasUser?: boolean },
): string {
  if (action === 'CHECK_IN') return 'Check-in';
  if (action === 'CHECK_OUT') return 'Check-out';
  if (action === 'DENIED') return 'Từ chối';
  if (action === 'FIRE_EMERGENCY') return 'Khẩn cấp';
  if (action === 'UNKNOWN') {
    return opts?.hasUser ? 'Sự kiện' : 'Người lạ';
  }
  return action || '—';
}

'use client';

import { useEffect, useState } from 'react';
import { AccessAction, CheckinEvent } from '@acv2/shared';
import { AlertTriangle, LogOut, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isMovementOnlyWarning } from '@/lib/accessLogLabels';

export default function CheckinToast({
  event,
  autoHideMs = 6000,
}: {
  event: CheckinEvent | null;
  autoHideMs?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<CheckinEvent | null>(null);

  useEffect(() => {
    if (!event) return;

    // Always show feedback for a scan; style differs for success vs warning/invalid.
    setShown(event);
    setVisible(true);

    const timer = window.setTimeout(() => setVisible(false), autoHideMs);
    return () => window.clearTimeout(timer);
  }, [event?.id, event?.warningMessage, event?.action, autoHideMs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown || !visible) return null;

  const isCheckOut = shown.action === AccessAction.CHECK_OUT;
  const isCheckIn = shown.action === AccessAction.CHECK_IN;
  const movementOnly = isMovementOnlyWarning(shown.warningMessage);
  const isWarning =
    !movementOnly &&
    (Boolean(shown.warningMessage) || !shown.isValid || (!isCheckIn && !isCheckOut));
  const photo = shown.snapshotUrl;
  const initial = (shown.fullName?.trim()?.[0] || '?').toUpperCase();

  const title = movementOnly
    ? isCheckOut
      ? 'Lượt ra — đã ghi log'
      : 'Lượt vào — đã ghi log'
    : isWarning
      ? shown.isValid === false
        ? 'Quét không hợp lệ'
        : 'Quét đã ghi nhận'
      : isCheckOut
        ? 'Chấm ra thành công'
        : 'Chấm vào thành công';

  return (
    <div
      className={cn(
        'pointer-events-auto absolute right-4 top-4 z-30 w-[320px] max-w-[calc(100%-2rem)]',
        'translate-y-0 opacity-100 transition-all duration-300 ease-out',
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'overflow-hidden rounded-lg bg-white shadow-xl ring-1',
          isWarning
            ? 'border border-amber-400/50 shadow-amber-900/10 ring-amber-500/20'
            : isCheckOut
              ? 'border border-amber-400/50 shadow-amber-900/10 ring-amber-500/20'
              : 'border border-emerald-400/50 shadow-emerald-900/10 ring-emerald-500/20',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between px-3 py-1.5',
            isWarning ? 'bg-amber-600' : isCheckOut ? 'bg-amber-600' : 'bg-emerald-600',
          )}
        >
          <div className="flex items-center gap-1.5 text-white">
            {isWarning ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : isCheckOut ? (
              <LogOut className="h-3.5 w-3.5" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest">{title}</span>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded p-0.5 text-white/80 hover:bg-white/15 hover:text-white"
            aria-label="Đóng"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex gap-3 p-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={shown.fullName ?? 'Face'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-bold text-slate-400">
                {initial}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{shown.fullName ?? 'Không xác định'}</p>
            <p
              className={cn(
                'mt-0.5 text-xs font-semibold',
                isWarning || isCheckOut ? 'text-amber-700' : 'text-emerald-700',
              )}
            >
              {shown.employeeCode ?? '—'}
            </p>
            {shown.warningMessage && (
              <p className="mt-1 text-[11px] font-medium text-amber-700">{shown.warningMessage}</p>
            )}
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {shown.departmentName ?? '—'}
              {shown.deviceName ? ` · ${shown.deviceName}` : ''}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {new Date(shown.timestamp).toLocaleTimeString('vi-VN')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

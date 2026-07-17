'use client';

import { useEffect, useState } from 'react';
import { AccessAction, CheckinEvent } from '@acv2/shared';
import { LogOut, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTO_HIDE_MS = 6000;

export default function CheckinToast({ event }: { event: CheckinEvent | null }) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<CheckinEvent | null>(null);

  useEffect(() => {
    if (!event) return;
    if (!event.isValid) return;
    if (event.warningMessage) return;
    if (event.action !== AccessAction.CHECK_IN && event.action !== AccessAction.CHECK_OUT) return;

    setShown(event);
    setVisible(true);

    const timer = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown || !visible) return null;

  const isCheckOut = shown.action === AccessAction.CHECK_OUT;
  const photo = shown.faceImageUrl || shown.snapshotUrl;
  const initial = (shown.fullName?.trim()?.[0] || '?').toUpperCase();

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
          isCheckOut
            ? 'border border-amber-400/50 shadow-amber-900/10 ring-amber-500/20'
            : 'border border-emerald-400/50 shadow-emerald-900/10 ring-emerald-500/20',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between px-3 py-1.5',
            isCheckOut ? 'bg-amber-600' : 'bg-emerald-600',
          )}
        >
          <div className="flex items-center gap-1.5 text-white">
            {isCheckOut ? (
              <LogOut className="h-3.5 w-3.5" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {isCheckOut ? 'Check-out thành công' : 'Check-in thành công'}
            </span>
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
                isCheckOut ? 'text-amber-700' : 'text-emerald-700',
              )}
            >
              {shown.employeeCode ?? '—'}
            </p>
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

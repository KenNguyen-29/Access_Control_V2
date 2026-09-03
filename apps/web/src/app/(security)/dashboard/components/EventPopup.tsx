'use client';

import { AccessAction, CheckinEvent } from '@acv2/shared';
import { UserCheck, AlertTriangle, Clock, MonitorSmartphone, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function FaceThumb({
  name,
  snapshotUrl,
  pending,
  invalid,
}: {
  name?: string;
  snapshotUrl?: string;
  pending?: boolean;
  invalid?: boolean;
}) {
  const initial = (name?.trim()?.[0] || '?').toUpperCase();

  return (
    <div
      className={cn(
        'relative h-24 w-24 shrink-0 overflow-hidden rounded-md border-2 bg-muted',
        invalid ? 'border-destructive/40' : 'border-primary/40',
      )}
    >
      {snapshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={snapshotUrl} alt={name ?? 'Snapshot'} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-slate-100 px-1 text-center">
          <span className="text-xl font-bold text-slate-400">{initial}</span>
          <span className="text-[9px] leading-tight text-slate-500">
            {pending ? 'Đang chụp…' : 'Không có ảnh chụp'}
          </span>
        </div>
      )}
    </div>
  );
}

export default function EventPopup({ event }: { event: CheckinEvent | null }) {
  if (!event) {
    return (
      <div className="border-b border-border bg-surface px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Sự kiện gần nhất
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">Chờ sự kiện check-in...</p>
      </div>
    );
  }

  const isCheckIn = event.action === AccessAction.CHECK_IN;
  const isCheckOut = event.action === AccessAction.CHECK_OUT;
  const hasWarning = !!event.warningMessage;
  const movementOnly =
    !!event.warningMessage &&
    (event.warningMessage.toLowerCase().includes('không tính thêm') ||
      event.warningMessage.toLowerCase().includes('lượt ra vào'));
  const statusLabel = !event.isValid
    ? 'Cảnh báo'
    : movementOnly
      ? 'Ra vào'
      : hasWarning
        ? 'Chưa tính'
        : isCheckIn
          ? 'Check-in hợp lệ'
          : isCheckOut
            ? 'Check-out'
            : 'Sự kiện';

  return (
    <div
      className={cn(
        'shrink-0 border-b px-3 py-3',
        !event.isValid
          ? 'border-destructive/20 bg-destructive/5'
          : hasWarning
            ? 'border-amber-200 bg-amber-50/80'
            : isCheckOut
              ? 'border-amber-200/80 bg-amber-50/50'
              : 'border-primary/20 bg-primary/5',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {!event.isValid || hasWarning ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          ) : (
            <UserCheck className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Sự kiện gần nhất
          </span>
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            !event.isValid
              ? 'bg-destructive text-white'
              : movementOnly
                ? 'bg-sky-600 text-white'
                : hasWarning
                  ? 'bg-amber-500 text-white'
                  : isCheckOut
                    ? 'bg-amber-600 text-white'
                    : 'bg-primary text-white',
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div className="flex gap-3">
        <FaceThumb
          name={event.fullName}
          snapshotUrl={event.snapshotUrl}
          pending={!event.snapshotUrl}
          invalid={!event.isValid || hasWarning}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-foreground">
            {event.fullName ?? 'Không xác định'}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-primary">{event.employeeCode ?? '—'}</p>

          <div className="mt-2 space-y-1 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate">{event.departmentName ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MonitorSmartphone className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate">{event.deviceName ?? event.deviceId}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0 text-slate-400" />
              <span>{new Date(event.timestamp).toLocaleString('vi-VN')}</span>
            </div>
          </div>

          {event.warningMessage && (
            <p className="mt-1.5 text-[11px] font-medium text-amber-700">{event.warningMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}

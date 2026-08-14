'use client';

import { AccessAction, CheckinEvent } from '@acv2/shared';
import { UserCheck, AlertTriangle, Clock, MonitorSmartphone, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function FaceThumb({
  name,
  faceImageUrl,
  snapshotUrl,
  invalid,
}: {
  name?: string;
  faceImageUrl?: string;
  snapshotUrl?: string;
  invalid?: boolean;
}) {
  const src = snapshotUrl || faceImageUrl;
  const initial = (name?.trim()?.[0] || '?').toUpperCase();

  return (
    <div
      className={cn(
        'relative h-24 w-24 shrink-0 overflow-hidden rounded-md border-2 bg-muted',
        invalid ? 'border-destructive/40' : 'border-primary/40',
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? 'Face'} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-100">
          <span className="text-2xl font-bold text-slate-400">{initial}</span>
        </div>
      )}
      {snapshotUrl && faceImageUrl && snapshotUrl !== faceImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faceImageUrl}
          alt="Enroll"
          className="absolute bottom-1 right-1 h-7 w-7 rounded border border-white object-cover shadow-sm"
        />
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
  const statusLabel = !event.isValid
    ? 'Cảnh báo'
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
          faceImageUrl={event.faceImageUrl}
          snapshotUrl={event.snapshotUrl}
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

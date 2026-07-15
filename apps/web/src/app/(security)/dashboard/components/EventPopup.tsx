'use client';

import { CheckinEvent } from '@acv2/shared';
import { UserCheck, AlertTriangle } from 'lucide-react';

export default function EventPopup({ event }: { event: CheckinEvent | null }) {
  if (!event) {
    return (
      <div className="border-b border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sự kiện gần nhất
        </p>
        <p className="mt-3 text-center text-sm text-muted-foreground">Chờ sự kiện check-in...</p>
      </div>
    );
  }

  return (
    <div
      className={`border-b p-4 ${
        event.isValid ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        {event.isValid ? (
          <UserCheck className="h-4 w-4 text-primary" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {event.isValid ? 'Check-in hợp lệ' : 'Cảnh báo'}
        </span>
      </div>
      <p className="text-sm font-semibold text-foreground">{event.fullName ?? 'Không xác định'}</p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>Mã NV: {event.employeeCode ?? '—'}</p>
        <p>Phòng ban: {event.departmentName ?? '—'}</p>
        <p>Thiết bị: {event.deviceName ?? event.deviceId}</p>
        <p>{new Date(event.timestamp).toLocaleString('vi-VN')}</p>
        {event.warningMessage && <p className="text-destructive">{event.warningMessage}</p>}
      </div>
      {(event.faceImageUrl || event.snapshotUrl) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {event.faceImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.faceImageUrl}
              alt="Face"
              className="rounded-sm border border-border object-cover"
            />
          )}
          {event.snapshotUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.snapshotUrl}
              alt="Snapshot"
              className="rounded-sm border border-border object-cover"
            />
          )}
        </div>
      )}
    </div>
  );
}

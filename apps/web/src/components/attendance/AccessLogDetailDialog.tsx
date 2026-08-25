'use client';

import { Building2, Clock, MonitorSmartphone, MapPin } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AccessLog } from '@/lib/api';

export type AccessLogDetailExtras = {
  snapshotUrl?: string;
  faceImageUrl?: string;
  departmentName?: string;
};

function actionLabel(action?: string): string {
  if (action === 'CHECK_IN') return 'Check-in';
  if (action === 'CHECK_OUT') return 'Check-out';
  if (action === 'UNKNOWN') return 'Người lạ';
  if (action === 'DENIED') return 'Từ chối';
  return action || '—';
}

function formatEventAt(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('vi-VN');
  return `${day}/${month}/${year} · ${time}`;
}

function FaceThumb({
  name,
  snapshotUrl,
  invalid,
}: {
  name?: string;
  snapshotUrl?: string;
  invalid?: boolean;
}) {
  const initial = (name?.trim()?.[0] || '?').toUpperCase();

  return (
    <div
      className={cn(
        'relative h-28 w-28 shrink-0 overflow-hidden rounded-md border-2 bg-muted',
        invalid ? 'border-destructive/40' : 'border-primary/40',
      )}
    >
      {snapshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={snapshotUrl} alt={name ?? 'Snapshot'} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 px-1 text-center">
          <span className="text-3xl font-bold text-slate-400">{initial}</span>
          <span className="text-[10px] leading-tight text-slate-500">Không có ảnh chụp</span>
        </div>
      )}
    </div>
  );
}

export function AccessLogDetailDialog({
  open,
  log,
  extras,
  onClose,
}: {
  open: boolean;
  log: AccessLog | null;
  extras?: AccessLogDetailExtras | null;
  onClose: () => void;
}) {
  if (!log) return null;

  const name = log.user?.fullName ?? 'Không xác định';
  const hasWarning = !!log.warningMessage;
  const invalid = log.isValid === false;
  const dept =
    extras?.departmentName ||
    log.user?.department?.name ||
    '—';
  const snapshotUrl = extras?.snapshotUrl || log.snapshotUrl || undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Chi tiết log ra vào"
      description="Thông tin sự kiện check-in / check-out"
      className="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex gap-4">
          <FaceThumb
            name={name}
            snapshotUrl={snapshotUrl}
            invalid={invalid || hasWarning}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-base font-bold text-foreground">{name}</p>
            <p className="font-mono text-sm text-primary">
              {log.user?.employeeCode || '—'}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant="outline" className="text-xs font-medium">
                {actionLabel(log.action)}
              </Badge>
              {invalid ? (
                <Badge className="border-transparent bg-destructive/15 text-xs text-destructive">
                  Cảnh báo
                </Badge>
              ) : hasWarning ? (
                <Badge className="border-transparent bg-amber-100 text-xs text-amber-800">
                  Chưa tính
                </Badge>
              ) : (
                <Badge className="border-transparent bg-emerald-100 text-xs text-emerald-700">
                  Hợp lệ
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2.5 rounded-sm border border-border bg-muted/20 px-3 py-3 text-sm">
          <DetailRow
            icon={<Building2 className="h-3.5 w-3.5" />}
            label="Phòng ban"
            value={dept}
          />
          <DetailRow
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Khu vực"
            value={log.zone?.name || '—'}
          />
          <DetailRow
            icon={<MonitorSmartphone className="h-3.5 w-3.5" />}
            label="Thiết bị"
            value={log.device?.name || '—'}
          />
          <DetailRow
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Thời gian"
            value={formatEventAt(log.eventAt)}
          />
        </div>

        {log.warningMessage && (
          <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {log.warningMessage}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

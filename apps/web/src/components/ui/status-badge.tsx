import { cn } from '@/lib/utils';
import { Badge } from './badge';

const STATUS_COLORS: Record<string, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  ON_TIME: 'bg-emerald-100 text-emerald-700',
  LATE: 'bg-amber-100 text-amber-700',
  EARLY_LEAVE: 'bg-orange-100 text-orange-700',
  ABSENT: 'bg-rose-100 text-rose-700',
  LEAVE: 'bg-blue-100 text-blue-700',
  OVERTIME: 'bg-violet-100 text-violet-700',
};

const STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Có mặt',
  ON_TIME: 'Đúng giờ',
  LATE: 'Đi muộn',
  EARLY_LEAVE: 'Về sớm',
  ABSENT: 'Vắng',
  LEAVE: 'Nghỉ phép',
  OVERTIME: 'Tăng ca',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status?.toUpperCase();
  return (
    <Badge
      variant="secondary"
      className={cn(
        'text-xs font-medium',
        STATUS_COLORS[key] ?? 'bg-slate-100 text-slate-600',
        className,
      )}
    >
      {STATUS_LABELS[key] ?? status}
    </Badge>
  );
}

const DEVICE_TYPE_COLORS: Record<string, string> = {
  AKUVOX: 'bg-violet-100 text-violet-700',
  CAMERA: 'bg-blue-100 text-blue-700',
};

export function DeviceTypeBadge({ type, className }: { type: string; className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'text-xs font-medium',
        DEVICE_TYPE_COLORS[type] ?? 'bg-slate-100 text-slate-600',
        className,
      )}
    >
      {type}
    </Badge>
  );
}

const SYNC_COLORS: Record<string, string> = {
  SYNCED: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-rose-100 text-rose-700',
  ERROR: 'bg-rose-100 text-rose-700',
};

export function SyncBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const key = status.toUpperCase();
  return (
    <Badge
      variant="secondary"
      className={cn(
        'text-xs font-medium',
        SYNC_COLORS[key] ?? 'bg-slate-100 text-slate-600',
        className,
      )}
    >
      {status}
    </Badge>
  );
}

'use client';

import { DoorOpen, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ZoneAccessCardZone = {
  zoneId: string;
  zoneName: string;
  permissionId: string;
  scheduleName: string | null;
  scheduleWindow: { start: string; end: string } | null;
  isAllDay: boolean;
  devices: Array<{
    deviceId: string;
    deviceName: string;
    deviceCode: string;
  }>;
};

interface ZoneAccessCardProps {
  zone: ZoneAccessCardZone;
  onRemove?: (permissionId: string) => void;
  removing?: boolean;
  className?: string;
}

function formatSchedule(zone: ZoneAccessCardZone): string {
  if (zone.isAllDay || !zone.scheduleName) {
    return 'Cả ngày';
  }
  if (zone.scheduleWindow) {
    return `${zone.scheduleName} (${zone.scheduleWindow.start} – ${zone.scheduleWindow.end})`;
  }
  return zone.scheduleName;
}

export function ZoneAccessCard({ zone, onRemove, removing, className }: ZoneAccessCardProps) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-white', className)}>
      <div className="flex items-start justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{zone.zoneName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            {formatSchedule(zone)}
          </p>
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
            disabled={removing}
            onClick={() => onRemove(zone.permissionId)}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Gỡ
          </Button>
        )}
      </div>
      <div className="px-3 py-2">
        {zone.devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có cửa/thiết bị</p>
        ) : (
          <ul className="space-y-1">
            {zone.devices.map((d) => (
              <li key={d.deviceId} className="flex items-center gap-2 text-xs">
                <DoorOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium">{d.deviceName}</span>
                {d.deviceCode && (
                  <span className="text-muted-foreground">({d.deviceCode})</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

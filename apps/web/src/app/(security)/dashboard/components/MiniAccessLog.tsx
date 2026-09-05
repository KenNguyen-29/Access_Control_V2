'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import type { CheckinEvent } from '@acv2/shared';
import {
  getAccessLogs,
  getAccessZones,
  getDevices,
  type AccessLog,
  type Device,
} from '@/lib/api';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { accessLogActionLabel, isMovementOnlyWarning } from '@/lib/accessLogLabels';

const ACTION_OPTIONS = [
  { value: '', label: 'Tất cả loại' },
  { value: 'CHECK_IN', label: 'Vào' },
  { value: 'CHECK_OUT', label: 'Ra' },
  { value: 'UNKNOWN', label: 'Người lạ' },
];

const VALIDITY_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'true', label: 'Hợp lệ' },
  { value: 'false', label: 'Cảnh báo' },
];

const POLL_INTERVAL_MS = 20_000;
const LOAD_DEBOUNCE_MS = 250;

function formatEventAt(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('vi-VN');
  return `${day}/${month}/${year} · ${time}`;
}

function dateOnlyFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function reportsDetailHref(log: AccessLog): string {
  const day = dateOnlyFromIso(log.eventAt);
  const q = new URLSearchParams({
    tab: 'detail',
    from: day,
    to: day,
  });
  const search =
    log.user?.employeeCode?.trim() || log.user?.fullName?.trim() || '';
  if (search) q.set('search', search);
  return `/reports?${q.toString()}`;
}

function checkinEventToAccessLog(event: CheckinEvent): AccessLog {
  return {
    id: event.id,
    eventAt: event.timestamp,
    action: event.action,
    isValid: event.isValid,
    warningMessage: event.warningMessage,
    user: event.fullName
      ? {
          fullName: event.fullName,
          employeeCode: event.employeeCode ?? '',
        }
      : null,
    device: event.deviceId
      ? {
          id: event.deviceId,
          name: event.deviceName ?? '—',
          code: event.deviceId,
        }
      : null,
  };
}

function matchesFilters(
  log: AccessLog,
  filters: { zoneId: string; deviceId: string; action: string; validity: string },
): boolean {
  if (filters.zoneId && log.zoneId !== filters.zoneId && log.zone?.id !== filters.zoneId) {
    return false;
  }
  if (filters.deviceId && log.device?.id !== filters.deviceId) return false;
  if (filters.action === 'UNKNOWN') {
    if (log.user) return false;
  } else if (filters.action && log.action !== filters.action) {
    return false;
  }
  if (filters.validity === 'true' && log.isValid === false) return false;
  if (filters.validity === 'false' && log.isValid !== false) return false;
  return true;
}

type Props = {
  /** Latest socket event — triggers an immediate list refresh. */
  lastEvent?: CheckinEvent | null;
};

export default function MiniAccessLog({ lastEvent }: Props) {
  const router = useRouter();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [zones, setZones] = useState<Array<{ id: string; name: string }>>([]);
  const [zoneId, setZoneId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [action, setAction] = useState('');
  const [validity, setValidity] = useState('');
  const [loading, setLoading] = useState(true);
  const lastHandledEventKey = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getAccessZones()
      .then((list) => setZones(list.map((z) => ({ id: z.id, name: z.name }))))
      .catch(() => {});
    getDevices({ page: 1, pageSize: 100 })
      .then((res) => {
        setDevices(
          res.items.filter((d) => d.deviceType === 'AKUVOX' || d.deviceType === 'DNAKE'),
        );
      })
      .catch(() => {});
  }, []);

  const devicesInZone = useMemo(() => {
    if (!zoneId) return devices;
    return devices.filter((d) => d.zoneId === zoneId);
  }, [devices, zoneId]);

  useEffect(() => {
    if (deviceId && zoneId && !devicesInZone.some((d) => d.id === deviceId)) {
      setDeviceId('');
    }
  }, [deviceId, zoneId, devicesInZone]);

  const load = useCallback(() => {
    const unknownOnly = action === 'UNKNOWN';
    getAccessLogs({
      limit: 50,
      zoneId: zoneId || undefined,
      deviceId: deviceId || undefined,
      action: unknownOnly ? undefined : action || undefined,
      unknownOnly: unknownOnly || undefined,
      isValid: validity === '' ? undefined : validity === 'true',
    })
      .then((items) =>
        setLogs(
          items.filter(
            (l) => !(l.warningMessage || '').toLowerCase().includes('quét trong vòng'),
          ),
        ),
      )
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [zoneId, deviceId, action, validity]);

  const loadDebounced = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => load(), LOAD_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [load]);

  useEffect(() => {
    if (!lastEvent?.id) return;
    const eventKey = `${lastEvent.id}:${lastEvent.timestamp}`;
    if (lastHandledEventKey.current === eventKey) return;
    lastHandledEventKey.current = eventKey;

    const optimistic = checkinEventToAccessLog(lastEvent);
    if ((optimistic.warningMessage || '').toLowerCase().includes('quét trong vòng')) return;
    const filters = { zoneId, deviceId, action, validity };
    if (matchesFilters(optimistic, filters)) {
      setLogs((prev) => {
        const without = prev.filter((l) => l.id !== optimistic.id);
        return [optimistic, ...without].slice(0, 50);
      });
    }
    loadDebounced();
  }, [lastEvent, zoneId, deviceId, action, validity, loadDebounced]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Lịch sử gần đây
        </p>
        <div className="space-y-1.5">
          <Select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="h-8 border-slate-200 bg-white px-2 text-xs"
          >
            <option value="">Tất cả công trường</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
          <Select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="h-8 border-slate-200 bg-white px-2 text-xs"
          >
            <option value="">Tất cả thiết bị</option>
            {devicesInZone.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-1.5">
            <Select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="h-8 border-slate-200 bg-white px-2 text-xs"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value || 'all-action'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Select
              value={validity}
              onChange={(e) => setValidity(e.target.value)}
              className="h-8 border-slate-200 bg-white px-2 text-xs"
            >
              {VALIDITY_OPTIONS.map((opt) => (
                <option key={opt.value || 'all-valid'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto">
        {loading && logs.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Đang tải...</p>
        )}
        {!loading && logs.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Không có sự kiện phù hợp</p>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            className={cn(
              'flex items-center gap-2 border-b border-border/60 px-3 py-2.5 text-sm hover:bg-muted/30',
              log.isValid === false && 'bg-destructive/5',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {log.user?.fullName ?? 'Không xác định'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {log.zone?.name ? `${log.zone.name} · ` : ''}
                {log.device?.name ?? '—'}
                {log.action
                  ? ` · ${accessLogActionLabel(log.action, {
                      hasUser: Boolean(log.user),
                      warningMessage: log.warningMessage,
                    })}`
                  : ''}
                {isMovementOnlyWarning(log.warningMessage) ? ' · Ra vào' : ''}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{formatEventAt(log.eventAt)}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              onClick={() => router.push(reportsDetailHref(log))}
            >
              <Eye className="h-3.5 w-3.5" />
              Chi tiết
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

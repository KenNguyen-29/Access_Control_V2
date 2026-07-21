'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckinEvent } from '@acv2/shared';
import { getAccessLogs, getDevices, type AccessLog, type Device } from '@/lib/api';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ACTION_OPTIONS = [
  { value: '', label: 'Tất cả loại' },
  { value: 'CHECK_IN', label: 'Check-in' },
  { value: 'CHECK_OUT', label: 'Check-out' },
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
    device: {
      id: event.deviceId,
      name: event.deviceName ?? '—',
      code: event.deviceId,
    },
  };
}

function matchesFilters(
  log: AccessLog,
  filters: { deviceId: string; action: string; validity: string },
): boolean {
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
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [action, setAction] = useState('');
  const [validity, setValidity] = useState('');
  const [loading, setLoading] = useState(true);
  const lastHandledEventKey = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getDevices({ page: 1, pageSize: 100 })
      .then((res) => {
        setDevices(res.items.filter((d) => d.deviceType === 'AKUVOX'));
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    const unknownOnly = action === 'UNKNOWN';
    getAccessLogs({
      limit: 50,
      deviceId: deviceId || undefined,
      action: unknownOnly ? undefined : action || undefined,
      unknownOnly: unknownOnly || undefined,
      isValid: validity === '' ? undefined : validity === 'true',
    })
      .then((items) =>
        setLogs(
          items.filter(
            (l) => !(l.warningMessage || '').toLowerCase().includes('chưa tính chấm công'),
          ),
        ),
      )
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [deviceId, action, validity]);

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

  // Socket-driven refresh: optimistic prepend + debounced API sync.
  useEffect(() => {
    if (!lastEvent?.id) return;
    const eventKey = `${lastEvent.id}:${lastEvent.timestamp}`;
    if (lastHandledEventKey.current === eventKey) return;
    lastHandledEventKey.current = eventKey;

    const optimistic = checkinEventToAccessLog(lastEvent);
    if ((optimistic.warningMessage || '').toLowerCase().includes('chưa tính chấm công')) return;
    const filters = { deviceId, action, validity };
    if (matchesFilters(optimistic, filters)) {
      setLogs((prev) => {
        const without = prev.filter((l) => l.id !== optimistic.id);
        return [optimistic, ...without].slice(0, 50);
      });
    }
    loadDebounced();
  }, [lastEvent, deviceId, action, validity, loadDebounced]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Lịch sử gần đây
        </p>
        <div className="space-y-1.5">
          <Select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="h-8 border-slate-200 bg-white px-2 text-xs"
          >
            <option value="">Tất cả thiết bị</option>
            {devices.map((d) => (
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
              'flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-sm hover:bg-muted/30',
              log.isValid === false && 'bg-destructive/5',
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {log.user?.fullName ?? 'Không xác định'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {log.device?.name ?? '—'}
                {log.action ? ` · ${log.action === 'CHECK_IN' ? 'Check-in' : log.action === 'CHECK_OUT' ? 'Check-out' : log.action}` : ''}
              </p>
            </div>
            <span className="ml-2 shrink-0 text-right text-xs text-muted-foreground">
              {formatEventAt(log.eventAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

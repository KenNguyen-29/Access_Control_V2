'use client';

import { useCallback, useEffect, useState } from 'react';
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

export default function MiniAccessLog() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [action, setAction] = useState('');
  const [validity, setValidity] = useState('');
  const [loading, setLoading] = useState(true);

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
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [deviceId, action, validity]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

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
            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
              {new Date(log.eventAt).toLocaleTimeString('vi-VN')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

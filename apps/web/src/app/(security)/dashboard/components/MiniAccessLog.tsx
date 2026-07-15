'use client';

import { useEffect, useState } from 'react';
import { getAccessLogs, type AccessLog } from '@/lib/api';

export default function MiniAccessLog() {
  const [logs, setLogs] = useState<AccessLog[]>([]);

  useEffect(() => {
    const load = () => {
      getAccessLogs()
        .then(setLogs)
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lịch sử gần đây
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto">
        {logs.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Chưa có dữ liệu</p>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-sm hover:bg-muted/30"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {log.user?.fullName ?? 'Không xác định'}
              </p>
              <p className="truncate text-xs text-muted-foreground">{log.device.name}</p>
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

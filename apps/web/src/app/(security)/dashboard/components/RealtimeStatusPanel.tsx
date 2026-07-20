'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { getHealth, type HealthStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 5_000) return 'vừa xong';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s trước`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} phút trước`;
  return new Date(iso).toLocaleTimeString('vi-VN');
}

type Props = {
  connected: boolean;
  onReconnect: () => void;
};

export default function RealtimeStatusPanel({ connected, onReconnect }: Props) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getHealth()
        .then((data) => {
          if (!cancelled) {
            setHealth(data);
            setError('');
          }
        })
        .catch(() => {
          if (!cancelled) setError('Không đọc được /api/health');
        });
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const waiting = health?.queue?.waiting ?? 0;
  const stalledHint = useMemo(() => {
    if (!health?.realtime?.lastWebhookAt) return false;
    if (waiting <= 0) return false;
    const webhookAge = Date.now() - new Date(health.realtime.lastWebhookAt).getTime();
    const processedAt = health.realtime.lastProcessedAt
      ? new Date(health.realtime.lastProcessedAt).getTime()
      : 0;
    const webhookAt = new Date(health.realtime.lastWebhookAt).getTime();
    return webhookAge > 8_000 && webhookAt > processedAt;
  }, [health, waiting]);

  return (
    <div className="shrink-0 border-b border-border bg-slate-50/80 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Realtime
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase',
              connected ? 'bg-primary/15 text-primary' : 'bg-destructive/10 text-destructive',
            )}
          >
            Socket {connected ? 'Online' : 'Offline'}
          </span>
          {!connected && (
            <button
              type="button"
              onClick={onReconnect}
              className="inline-flex h-6 items-center gap-1 rounded-sm border border-slate-300 bg-white px-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
              title="Kết nối lại WebSocket"
            >
              <RefreshCw className="h-3 w-3" />
              Kết nối lại
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {health && (
        <div className="space-y-1 text-[11px] text-slate-600">
          <p>
            Queue:{' '}
            <span className="font-semibold text-slate-800">
              {'mode' in (health.queue ?? {}) && health.queue?.mode === 'sync'
                ? 'sync'
                : `waiting ${waiting} · active ${health.queue?.active ?? 0} · failed ${health.queue?.failed ?? 0}`}
            </span>
          </p>
          <p>
            Webhook: <span className="font-medium">{relTime(health.realtime?.lastWebhookAt)}</span>
            {' · '}
            Process: <span className="font-medium">{relTime(health.realtime?.lastProcessedAt)}</span>
            {' · '}
            Emit: <span className="font-medium">{relTime(health.realtime?.lastEmitAt)}</span>
          </p>
          {health.realtime?.lastSkipReason && (
            <p className="font-medium text-amber-700">Skip: {health.realtime.lastSkipReason}</p>
          )}
          {stalledHint && (
            <p className="font-semibold text-destructive">
              Job có thể đang tắc (waiting &gt; 0, chưa process). Kiểm tra worker / restart API.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

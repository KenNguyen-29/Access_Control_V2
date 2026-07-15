'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import type { AccessSyncReport } from '@/lib/accessSync';
import { cn } from '@/lib/utils';

interface AccessSyncReportPanelProps {
  report: AccessSyncReport | null;
  className?: string;
}

export function AccessSyncReportPanel({ report, className }: AccessSyncReportPanelProps) {
  if (!report || report.total === 0) return null;

  return (
    <div className={cn('space-y-2 rounded-lg border border-border bg-white p-3', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Kết quả đồng bộ</span>
        <span
          className={cn(
            'text-xs font-medium',
            report.success ? 'text-emerald-600' : 'text-amber-600',
          )}
        >
          {report.synced}/{report.total} thành công
        </span>
      </div>
      {report.failed.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {report.failed.map((item) => (
            <li
              key={`${item.deviceId}-${item.error}`}
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <span>
                <span className="font-medium text-foreground">{item.deviceName}</span>
                {item.error ? `: ${item.error}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.success && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Đồng bộ thành công tất cả thiết bị
        </p>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { QueryBoundary } from '@/components/ui/query-states';
import {
  getAccessLogs,
  getAttendanceRecords,
  type AccessLog,
  type AttendanceRecord,
} from '@/lib/api';
import { accessLogActionLabel, accessLogKindLabel } from '@/lib/accessLogLabels';
import { cn } from '@/lib/utils';

export type PersonHistoryTarget = {
  userId: string;
  fullName: string;
  employeeCode?: string | null;
};

function formatDt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
}

function formatDateOnly(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('vi-VN');
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function KindBadge({ log }: { log: AccessLog }) {
  const kind = accessLogKindLabel({
    action: log.action,
    isValid: log.isValid,
    warningMessage: log.warningMessage,
    hasUser: Boolean(log.user || log.userId),
  });
  return (
    <Badge
      className={cn(
        'border-transparent text-xs',
        kind.kind === 'movement' && 'bg-sky-100 text-sky-800',
        kind.kind === 'attendance' && 'bg-emerald-100 text-emerald-700',
        kind.kind === 'warning' && 'bg-destructive/15 text-destructive',
        kind.kind === 'stranger' && 'bg-amber-100 text-amber-800',
        kind.kind === 'other' && 'bg-muted text-muted-foreground',
      )}
    >
      {kind.label}
    </Badge>
  );
}

export function PersonHistoryDialog({
  open,
  person,
  from,
  to,
  onClose,
}: {
  open: boolean;
  person: PersonHistoryTarget | null;
  from?: string;
  to?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState('attendance');

  const range = useMemo(() => {
    if (from || to) {
      return { from: from || undefined, to: to || undefined };
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: fmt(start), to: fmt(end) };
  }, [from, to]);

  const attendanceQuery = useQuery({
    queryKey: ['person-history', 'attendance', person?.userId, range.from, range.to],
    queryFn: () =>
      getAttendanceRecords({
        page: 1,
        pageSize: 50,
        userId: person!.userId,
        from: range.from,
        to: range.to,
      }),
    enabled: open && !!person?.userId,
  });

  const movementsQuery = useQuery({
    queryKey: ['person-history', 'movements', person?.userId, range.from, range.to],
    queryFn: () =>
      getAccessLogs({
        page: 1,
        pageSize: 100,
        userId: person!.userId,
        from: range.from,
        to: range.to,
      }),
    enabled: open && !!person?.userId,
  });

  if (!person) return null;

  const attendanceRows = attendanceQuery.data?.items ?? [];
  const accessLogs = movementsQuery.data?.items ?? [];
  const attendanceLogs = accessLogs.filter(
    (l) =>
      (l.action === 'CHECK_IN' || l.action === 'CHECK_OUT') &&
      !String(l.warningMessage || '').toLowerCase().includes('không tính thêm'),
  );
  const movementLogs = accessLogs.filter((l) =>
    String(l.warningMessage || '').toLowerCase().includes('không tính thêm'),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={person.fullName}
      description={`${person.employeeCode || '—'} · Lịch sử chấm công và ra vào (${range.from || '…'} → ${range.to || '…'})`}
      className="max-w-3xl"
    >
      <Tabs value={tab} onValueChange={setTab} className="mt-1">
        <TabsList className="mb-3 w-full">
          <TabsTrigger value="attendance" className="flex-1">
            Chấm công ({attendanceRows.length})
          </TabsTrigger>
          <TabsTrigger value="movements" className="flex-1">
            Ra vào ({movementLogs.length})
          </TabsTrigger>
          <TabsTrigger value="all-logs" className="flex-1">
            Tất cả log ({accessLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="mt-0">
          <QueryBoundary
            isLoading={attendanceQuery.isLoading}
            error={
              attendanceQuery.error instanceof Error
                ? attendanceQuery.error.message
                : attendanceQuery.error
                  ? 'Không tải được lịch sử chấm công'
                  : null
            }
            isEmpty={attendanceRows.length === 0}
            onRetry={() => void attendanceQuery.refetch()}
            emptyTitle="Chưa có bản ghi chấm công"
            emptyDescription="Trong khoảng ngày đã chọn không có check-in/out tính công."
          >
            <AttendanceTable rows={attendanceRows} />
          </QueryBoundary>
        </TabsContent>

        <TabsContent value="movements" className="mt-0">
          <p className="mb-2 text-xs text-muted-foreground">
            Các lần quét sau khi đã chấm vào + ra trong ngày — chỉ lưu log, không tính lại công.
          </p>
          <QueryBoundary
            isLoading={movementsQuery.isLoading}
            error={
              movementsQuery.error instanceof Error
                ? movementsQuery.error.message
                : movementsQuery.error
                  ? 'Không tải được lịch sử ra vào'
                  : null
            }
            isEmpty={movementLogs.length === 0}
            onRetry={() => void movementsQuery.refetch()}
            emptyTitle="Chưa có lượt ra vào"
            emptyDescription="Chưa có quét nào sau khi đã hoàn tất chấm công trong ngày."
          >
            <AccessLogTable rows={movementLogs} />
          </QueryBoundary>
        </TabsContent>

        <TabsContent value="all-logs" className="mt-0">
          <p className="mb-2 text-xs text-muted-foreground">
            Gồm cả chấm công ({attendanceLogs.length}) và lượt ra vào ({movementLogs.length}).
          </p>
          <QueryBoundary
            isLoading={movementsQuery.isLoading}
            error={
              movementsQuery.error instanceof Error
                ? movementsQuery.error.message
                : movementsQuery.error
                  ? 'Không tải được log'
                  : null
            }
            isEmpty={accessLogs.length === 0}
            onRetry={() => void movementsQuery.refetch()}
            emptyTitle="Không có log"
            emptyDescription="Thử đổi khoảng ngày."
          >
            <AccessLogTable rows={accessLogs} />
          </QueryBoundary>
        </TabsContent>
      </Tabs>
    </Dialog>
  );
}

function AttendanceTable({ rows }: { rows: AttendanceRecord[] }) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-sm border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/80 text-left">
          <tr className="border-b border-border">
            <th className="p-2 font-semibold">Ngày</th>
            <th className="p-2 font-semibold">Chấm vào</th>
            <th className="p-2 font-semibold">Chấm ra</th>
            <th className="p-2 font-semibold">Trạng thái</th>
            <th className="p-2 font-semibold">Muộn</th>
            <th className="p-2 font-semibold">OT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-2 font-mono text-xs">{formatDateOnly(r.date)}</td>
              <td className="p-2 font-mono text-xs">{formatTime(r.checkInAt)}</td>
              <td className="p-2 font-mono text-xs">{formatTime(r.checkOutAt)}</td>
              <td className="p-2 text-xs">{r.status}</td>
              <td className="p-2 text-xs">{r.lateMinutes ? `${r.lateMinutes}p` : '—'}</td>
              <td className="p-2 text-xs">{r.otMinutes ? `${r.otMinutes}p` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccessLogTable({ rows }: { rows: AccessLog[] }) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-sm border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/80 text-left">
          <tr className="border-b border-border">
            <th className="p-2 font-semibold">Thời gian</th>
            <th className="p-2 font-semibold">Hành động</th>
            <th className="p-2 font-semibold">Loại</th>
            <th className="p-2 font-semibold">Thiết bị</th>
            <th className="p-2 font-semibold">Khu vực</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((log) => (
            <tr key={log.id} className="border-t border-border">
              <td className="p-2 font-mono text-xs text-muted-foreground">
                {formatDt(log.eventAt)}
              </td>
              <td className="p-2">
                <Badge variant="outline" className="text-xs font-normal">
                  {accessLogActionLabel(log.action, {
                    hasUser: Boolean(log.user || log.userId),
                    warningMessage: log.warningMessage,
                  })}
                </Badge>
              </td>
              <td className="p-2">
                <KindBadge log={log} />
              </td>
              <td className="p-2 text-xs text-muted-foreground">{log.device?.name || '—'}</td>
              <td className="p-2 text-xs text-muted-foreground">{log.zone?.name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

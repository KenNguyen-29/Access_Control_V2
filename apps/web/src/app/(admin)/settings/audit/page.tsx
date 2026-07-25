'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageShell, DesignCard } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import { queryKeys } from '@/lib/queryKeys';
import { ApiError, getAuditLogs } from '@/lib/api';

export default function AuditSettingsPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const pageSize = 20;

  const params = {
    page,
    pageSize,
    ...(entity.trim() ? { entity: entity.trim() } : {}),
    ...(action.trim() ? { action: action.trim() } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  const query = useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => getAuditLogs(params),
  });

  const total = query.data?.total ?? 0;
  const items = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? Math.max(1, Math.ceil(Number(total) / pageSize));

  return (
    <PageShell
      title="Audit Log"
      subtitle="Nhật ký thao tác hệ thống (đổi settings, backup, retention…)"
      badge="Settings"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </Button>
      }
    >
      <DesignCard title="Bộ lọc">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            Entity
            <Input value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} />
          </label>
          <label className="space-y-1 text-sm">
            Action
            <Input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
          </label>
          <label className="space-y-1 text-sm">
            Từ ngày
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </label>
          <label className="space-y-1 text-sm">
            Đến ngày
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </label>
        </div>
      </DesignCard>

      <QueryBoundary
        isLoading={query.isLoading}
        error={
          query.error instanceof ApiError
            ? query.error.message
            : query.error
              ? 'Không tải được audit log'
              : null
        }
        onRetry={() => void query.refetch()}
      >
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Thời gian</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Entity ID</th>
                <th className="px-3 py-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Không có bản ghi
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-2 font-medium">{row.action}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.entity}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.entityId ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.actorId ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Trang {page}/{totalPages} · {total} bản ghi
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      </QueryBoundary>
    </PageShell>
  );
}

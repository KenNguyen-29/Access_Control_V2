'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { QueryBoundary } from '@/components/ui/query-states';
import { useAccessControl } from '@/hooks/useAccessControl';
import type { AccessGroup } from '@/lib/accessControl';

function statusLabel(s: AccessGroup['status']) {
  if (s === 'applied') return 'Đã áp dụng';
  if (s === 'partial') return 'Một phần';
  if (s === 'failed') return 'Thất bại';
  return 'Chờ áp dụng';
}

export function AccessSearchPanel() {
  const { groups, loading, error, refetch } = useAccessControl();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results: Array<{
      personName: string;
      personId: string;
      organization: string;
      accessGroup: string;
      accessPoint: string;
      zoneSchedule: string;
      syncStatus: string;
    }> = [];

    groups.forEach((g) => {
      g.persons.forEach((p) => {
        if (g.accessPoints.length === 0) {
          results.push({
            personName: p.name,
            personId: p.personId,
            organization: p.organization,
            accessGroup: g.name,
            accessPoint: '—',
            zoneSchedule: g.scheduleTemplate,
            syncStatus: statusLabel(g.status),
          });
          return;
        }
        g.accessPoints.forEach((ap) => {
          results.push({
            personName: p.name,
            personId: p.personId,
            organization: p.organization,
            accessGroup: g.name,
            accessPoint: ap.name,
            zoneSchedule: g.scheduleTemplate,
            syncStatus: statusLabel(g.status),
          });
        });
      });
    });

    if (!q) return results;
    return results.filter(
      (r) =>
        r.personName.toLowerCase().includes(q) ||
        r.personId.toLowerCase().includes(q) ||
        r.accessGroup.toLowerCase().includes(q) ||
        r.accessPoint.toLowerCase().includes(q),
    );
  }, [groups, query]);

  return (
    <QueryBoundary isLoading={loading} error={error} onRetry={refetch}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border p-3">
          <Input
            placeholder="Tìm theo tên, mã NV, khu vực, điểm truy cập..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-border bg-card">
              <tr className="text-left">
                <th className="p-2 font-medium">Nhân viên</th>
                <th className="p-2 font-medium">Mã NV</th>
                <th className="p-2 font-medium">Phòng ban</th>
                <th className="p-2 font-medium">Khu vực</th>
                <th className="p-2 font-medium">Điểm truy cập</th>
                <th className="p-2 font-medium">Lịch</th>
                <th className="p-2 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={`${r.personId}-${r.accessGroup}-${r.accessPoint}-${i}`}
                    className="border-b border-border/50"
                  >
                    <td className="p-2">{r.personName}</td>
                    <td className="p-2">{r.personId}</td>
                    <td className="p-2">{r.organization}</td>
                    <td className="p-2">{r.accessGroup}</td>
                    <td className="p-2">{r.accessPoint}</td>
                    <td className="p-2">{r.zoneSchedule}</td>
                    <td className="p-2">{r.syncStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </QueryBoundary>
  );
}

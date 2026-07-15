'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/query-states';
import { getAttendanceRecords, type AttendanceRecord } from '@/lib/api';

export default function AttendanceBoard() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const load = () => {
      getAttendanceRecords({ page: 1, pageSize: 50, from: today, to: today })
        .then((res) => setRecords(res.items))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (!loading && records.length === 0) {
    return <EmptyState title="Chưa có chấm công" description="Dữ liệu điểm danh hôm nay sẽ hiển thị tại đây." />;
  }

  return (
    <div className="space-y-2">
      {records.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2.5"
        >
          <Avatar name={r.user?.fullName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {r.user?.fullName || r.userId}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {r.workShift?.name || 'Chưa gán ca'}
              {r.checkInAt ? ` · ${new Date(r.checkInAt).toLocaleTimeString('vi-VN')}` : ''}
            </p>
          </div>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  );
}

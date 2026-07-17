'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/query-states';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  getAttendanceRecords,
  getDepartments,
  type AttendanceRecord,
  type Department,
} from '@/lib/api';

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'LATE', label: 'Đi muộn' },
  { value: 'EARLY_LEAVE', label: 'Về sớm' },
  { value: 'ON_TIME', label: 'Đúng giờ' },
  { value: 'OVERTIME', label: 'Tăng ca' },
  { value: 'ABSENT', label: 'Vắng' },
];

export default function AttendanceBoard() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayLocal);
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  useEffect(() => {
    getDepartments()
      .then(setDepartments)
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getAttendanceRecords({
      page: 1,
      pageSize: 100,
      from: date,
      to: date,
      departmentId: departmentId || undefined,
      status: status || undefined,
    })
      .then((res) => setRecords(res.items))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [date, status, departmentId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0 space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 border-slate-200 bg-white px-2 text-xs"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 border-slate-200 bg-white px-2 text-xs"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="h-8 border-slate-200 bg-white px-2 text-xs"
        >
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {loading && records.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">Đang tải...</p>
        )}
        {!loading && records.length === 0 && (
          <EmptyState
            title="Không có dữ liệu"
            description="Thử đổi ngày, trạng thái hoặc phòng ban."
          />
        )}
        {records.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2.5"
          >
            <Avatar name={r.user?.fullName} src={r.user?.faceImageUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {r.user?.fullName || r.userId}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {r.user?.department?.name || r.user?.employeeCode || '—'}
                {r.workShift?.name ? ` · ${r.workShift.name}` : ''}
                {r.checkInAt ? ` · ${new Date(r.checkInAt).toLocaleTimeString('vi-VN')}` : ''}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

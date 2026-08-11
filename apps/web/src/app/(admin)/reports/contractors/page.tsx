'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DesignCard, PageShell } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import {
  ApiError,
  downloadContractorAccessLogsExcel,
  downloadContractorPersonnelExcel,
  downloadShiftPersonnelExcel,
  getContractorAccessLogs,
  getContractorHeadcount,
  getContractorPersonnel,
  getContractors,
  getProjects,
  getShiftPersonnelReport,
  getWorkShifts,
  runContractorSnapshot,
} from '@/lib/api';

const PAGE_SIZE = 10;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function usePagedRows<T>(rows: T[], page: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  return { pageRows, total, totalPages, currentPage };
}

function TablePager({
  currentPage,
  totalPages,
  total,
  unit,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  unit: string;
  onPageChange: (page: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Trang {currentPage} / {totalPages} · {total} {unit}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function ContractorReportsPage() {
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [contractorId, setContractorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [workShiftId, setWorkShiftId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [personnelPage, setPersonnelPage] = useState(1);
  const [accessPage, setAccessPage] = useState(1);
  const [shiftPage, setShiftPage] = useState(1);

  const contractorsQuery = useQuery({
    queryKey: ['contractors'],
    queryFn: () => getContractors(),
  });
  const projectsQuery = useQuery({
    queryKey: ['projects', 'reports-filter'],
    queryFn: () => getProjects(),
  });
  const shiftsQuery = useQuery({
    queryKey: ['workShifts'],
    queryFn: () => getWorkShifts(),
  });
  const headcountQuery = useQuery({
    queryKey: ['contractor-headcount', to],
    queryFn: () => getContractorHeadcount(to),
  });
  const personnelQuery = useQuery({
    queryKey: ['contractor-personnel', from, to, contractorId, projectId],
    queryFn: () =>
      getContractorPersonnel({
        from,
        to,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
      }),
  });
  const accessQuery = useQuery({
    queryKey: ['contractor-access', from, to, contractorId, projectId],
    queryFn: () =>
      getContractorAccessLogs({
        from,
        to,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
      }),
  });
  const shiftQuery = useQuery({
    queryKey: ['shift-personnel', contractorId, workShiftId],
    queryFn: () =>
      getShiftPersonnelReport({
        contractorId: contractorId || undefined,
        workShiftId: workShiftId || undefined,
      }),
  });

  const contractors = contractorsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const shifts = shiftsQuery.data ?? [];
  const headcountRows = headcountQuery.data?.rows ?? [];
  const personnelRows = personnelQuery.data?.rows ?? [];
  const accessRows = accessQuery.data?.rows ?? [];
  const shiftRows = shiftQuery.data?.rows ?? [];

  useEffect(() => {
    const p = searchParams.get('projectId');
    if (p) setProjectId(p);
  }, [searchParams]);

  useEffect(() => {
    setPersonnelPage(1);
    setAccessPage(1);
  }, [from, to, contractorId, projectId]);

  useEffect(() => {
    setShiftPage(1);
  }, [contractorId, workShiftId]);

  const personnelPaged = usePagedRows(personnelRows, personnelPage);
  const accessPaged = usePagedRows(accessRows, accessPage);
  const shiftPaged = usePagedRows(shiftRows, shiftPage);

  const snapshotMutation = useMutation({
    mutationFn: () => runContractorSnapshot({ date: to, push: true }),
    onSuccess: () => {
      setNotice('Đã tạo snapshot và thử đẩy hệ giám sát');
      setError(null);
      void headcountQuery.refetch();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Snapshot thất bại'),
  });

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (contractorId) parts.push(contractors.find((c) => c.id === contractorId)?.name ?? '');
    if (projectId) parts.push(projects.find((p) => p.id === projectId)?.name ?? '');
    return parts.length ? parts.join(' · ') : 'Tất cả';
  }, [contractorId, projectId, contractors, projects]);

  return (
    <PageShell
      badge="Báo cáo"
      title="Báo cáo nhà thầu"
      subtitle="Headcount, nhân sự, vào/ra, ca làm — theo nhà thầu / dự án."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void headcountQuery.refetch();
            void personnelQuery.refetch();
            void accessQuery.refetch();
            void shiftQuery.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </Button>
      }
    >
      {notice && (
        <p className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">{notice}</p>
      )}
      {error && (
        <p className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <DesignCard title="Bộ lọc">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
            <Input type="date" className="input-design h-10" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Đến ngày</label>
            <Input type="date" className="input-design h-10" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nhà thầu</label>
            <Select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
              <option value="">Tất cả</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Dự án</label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Tất cả</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Ca (báo cáo ca)</label>
            <Select value={workShiftId} onChange={(e) => setWorkShiftId(e.target.value)}>
              <option value="">Tất cả ca</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </DesignCard>

      <DesignCard
        title={`Số lượng theo nhà thầu (${to})`}
        description="Đăng ký vs có mặt (có AccessLog hợp lệ trong ngày)."
        actions={
          <Button
            variant="accent"
            size="sm"
            disabled={snapshotMutation.isPending}
            onClick={() => snapshotMutation.mutate()}
          >
            <Send className="h-4 w-4" />
            Snapshot + đẩy giám sát
          </Button>
        }
      >
        <QueryBoundary isLoading={headcountQuery.isLoading} isEmpty={headcountRows.length === 0}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="p-2 font-semibold">Nhà thầu</th>
                <th className="p-2 text-right font-semibold">Đăng ký</th>
                <th className="p-2 text-right font-semibold">Có mặt</th>
              </tr>
            </thead>
            <tbody>
              {headcountRows.map((r) => (
                <tr key={r.contractorId} className="border-t border-border">
                  <td className="p-2">
                    <span className="font-semibold">{r.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{r.code}</span>
                  </td>
                  <td className="p-2 text-right">{r.registeredCount}</td>
                  <td className="p-2 text-right font-semibold">{r.presentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </QueryBoundary>
      </DesignCard>

      <DesignCard
        title={`Nhân sự nhà thầu (${filterLabel})`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void downloadContractorPersonnelExcel({
                from,
                to,
                contractorId: contractorId || undefined,
              }).then((b) => downloadBlob(b, 'contractor-personnel.xlsx'))
            }
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        }
      >
        <QueryBoundary isLoading={personnelQuery.isLoading} isEmpty={personnelRows.length === 0}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Mã</th>
                  <th className="p-2 font-semibold">Họ tên</th>
                  <th className="p-2 font-semibold">CCCD</th>
                  <th className="p-2 font-semibold">Nhà thầu</th>
                  <th className="p-2 font-semibold">Vào đầu</th>
                  <th className="p-2 font-semibold">Ra cuối</th>
                </tr>
              </thead>
              <tbody>
                {personnelPaged.pageRows.map((r) => (
                  <tr key={String(r.userId)} className="border-t border-border">
                    <td className="p-2 font-mono text-xs">{String(r.employeeCode ?? '')}</td>
                    <td className="p-2">{String(r.fullName ?? '')}</td>
                    <td className="p-2 font-mono text-xs">{String(r.citizenId ?? '—')}</td>
                    <td className="p-2 text-xs">{String(r.contractorName ?? '—')}</td>
                    <td className="p-2 text-xs">
                      {r.firstCheckInAt ? new Date(String(r.firstCheckInAt)).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="p-2 text-xs">
                      {r.lastCheckOutAt ? new Date(String(r.lastCheckOutAt)).toLocaleString('vi-VN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager
            currentPage={personnelPaged.currentPage}
            totalPages={personnelPaged.totalPages}
            total={personnelPaged.total}
            unit="nhân sự"
            onPageChange={setPersonnelPage}
          />
        </QueryBoundary>
      </DesignCard>

      <DesignCard
        title="Lịch sử vào/ra"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void downloadContractorAccessLogsExcel({
                from,
                to,
                contractorId: contractorId || undefined,
              }).then((b) => downloadBlob(b, 'contractor-access-logs.xlsx'))
            }
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        }
      >
        <QueryBoundary isLoading={accessQuery.isLoading} isEmpty={accessRows.length === 0}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Thời gian</th>
                  <th className="p-2 font-semibold">NV</th>
                  <th className="p-2 font-semibold">Hành động</th>
                  <th className="p-2 font-semibold">Nhà thầu</th>
                  <th className="p-2 font-semibold">Thiết bị</th>
                </tr>
              </thead>
              <tbody>
                {accessPaged.pageRows.map((r) => (
                  <tr key={String(r.id)} className="border-t border-border">
                    <td className="p-2 text-xs">
                      {r.eventAt ? new Date(String(r.eventAt)).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="p-2 text-xs">
                      {String(r.fullName ?? '')}{' '}
                      <span className="font-mono text-muted-foreground">
                        ({String(r.employeeCode ?? '')})
                      </span>
                    </td>
                    <td className="p-2 text-xs">{String(r.action ?? '')}</td>
                    <td className="p-2 text-xs">{String(r.contractorName ?? '—')}</td>
                    <td className="p-2 text-xs">{String(r.deviceName ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager
            currentPage={accessPaged.currentPage}
            totalPages={accessPaged.totalPages}
            total={accessPaged.total}
            unit="sự kiện"
            onPageChange={setAccessPage}
          />
        </QueryBoundary>
      </DesignCard>

      <DesignCard
        title="Nhân sự theo ca"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void downloadShiftPersonnelExcel({
                contractorId: contractorId || undefined,
                workShiftId: workShiftId || undefined,
              }).then((b) => downloadBlob(b, 'shift-personnel.xlsx'))
            }
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        }
      >
        <QueryBoundary isLoading={shiftQuery.isLoading} isEmpty={shiftRows.length === 0}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Ca</th>
                  <th className="p-2 font-semibold">NV</th>
                  <th className="p-2 font-semibold">CCCD</th>
                  <th className="p-2 font-semibold">Nhà thầu</th>
                  <th className="p-2 font-semibold">Giờ</th>
                </tr>
              </thead>
              <tbody>
                {shiftPaged.pageRows.map((r) => (
                  <tr key={String(r.assignmentId)} className="border-t border-border">
                    <td className="p-2 text-xs">{String(r.shiftName ?? '')}</td>
                    <td className="p-2 text-xs">
                      {String(r.fullName ?? '')}{' '}
                      <span className="font-mono text-muted-foreground">
                        ({String(r.employeeCode ?? '')})
                      </span>
                    </td>
                    <td className="p-2 font-mono text-xs">{String(r.citizenId ?? '—')}</td>
                    <td className="p-2 text-xs">{String(r.contractorName ?? '—')}</td>
                    <td className="p-2 font-mono text-xs">
                      {String(r.startTime ?? '')}–{String(r.endTime ?? '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager
            currentPage={shiftPaged.currentPage}
            totalPages={shiftPaged.totalPages}
            total={shiftPaged.total}
            unit="phân công"
            onPageChange={setShiftPage}
          />
        </QueryBoundary>
      </DesignCard>
    </PageShell>
  );
}

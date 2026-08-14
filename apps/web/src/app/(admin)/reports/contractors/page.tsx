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
  downloadContractorHeadcountExcel,
  downloadContractorMonthlyDetailExcel,
  downloadContractorMonthlyExcel,
  downloadContractorPersonnelExcel,
  downloadShiftPersonnelExcel,
  getContractorAccessLogs,
  getContractorHeadcount,
  getContractorMonthly,
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
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [contractorId, setContractorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [workShiftId, setWorkShiftId] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [personnelPage, setPersonnelPage] = useState(1);
  const [accessPage, setAccessPage] = useState(1);
  const [shiftPage, setShiftPage] = useState(1);
  const [monthlyPage, setMonthlyPage] = useState(1);

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
    queryKey: ['contractor-access', from, to, contractorId, projectId, userId],
    queryFn: () =>
      getContractorAccessLogs({
        from,
        to,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
        userId: userId || undefined,
      }),
  });
  const shiftQuery = useQuery({
    queryKey: ['shift-personnel', contractorId, workShiftId, projectId],
    queryFn: () =>
      getShiftPersonnelReport({
        contractorId: contractorId || undefined,
        workShiftId: workShiftId || undefined,
        projectId: projectId || undefined,
      }),
  });
  const monthlyQuery = useQuery({
    queryKey: ['contractor-monthly', month, contractorId, projectId],
    queryFn: () =>
      getContractorMonthly({
        month,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
      }),
  });

  const contractors = contractorsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const shifts = shiftsQuery.data ?? [];
  const headcountRows = headcountQuery.data?.rows ?? [];
  const personnelRows = personnelQuery.data?.rows ?? [];
  const accessRows = accessQuery.data?.rows ?? [];
  const shiftRows = shiftQuery.data?.rows ?? [];
  const monthlyRows = monthlyQuery.data?.rows ?? [];
  const personOptions = useMemo(
    () =>
      personnelRows
        .map((r) => ({
          id: String(r.userId ?? ''),
          label: `${String(r.fullName ?? '')} (${String(r.employeeCode ?? '')})`,
        }))
        .filter((p) => p.id),
    [personnelRows],
  );

  useEffect(() => {
    const p = searchParams.get('projectId');
    if (p) setProjectId(p);
  }, [searchParams]);

  useEffect(() => {
    setPersonnelPage(1);
    setAccessPage(1);
  }, [from, to, contractorId, projectId]);

  useEffect(() => {
    setUserId('');
  }, [contractorId, projectId]);

  useEffect(() => {
    setShiftPage(1);
  }, [contractorId, workShiftId]);

  useEffect(() => {
    setMonthlyPage(1);
  }, [month, contractorId, projectId]);

  const personnelPaged = usePagedRows(personnelRows, personnelPage);
  const accessPaged = usePagedRows(accessRows, accessPage);
  const shiftPaged = usePagedRows(shiftRows, shiftPage);
  const monthlyPaged = usePagedRows(monthlyRows, monthlyPage);

  async function exportExcel(run: () => Promise<Blob>, filename: string) {
    try {
      const blob = await run();
      downloadBlob(blob, filename);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Xuất Excel thất bại');
    }
  }

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
      subtitle="Số lượng, nhân sự, vào/ra từng người, ca, ngày công tháng — xuất Excel đủ mẫu sếp yêu cầu."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void headcountQuery.refetch();
            void personnelQuery.refetch();
            void accessQuery.refetch();
            void shiftQuery.refetch();
            void monthlyQuery.refetch();
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
            <Input type="date" className="input-design h-10" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Đến ngày</label>
            <Input type="date" className="input-design h-10" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Tháng (ngày công)</label>
            <Input
              type="month"
              className="input-design h-10"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void exportExcel(
                  () => downloadContractorHeadcountExcel({ date: to }),
                  `so-luong-nha-thau-${to}.xlsx`,
                )
              }
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={snapshotMutation.isPending}
              onClick={() => snapshotMutation.mutate()}
            >
              <Send className="h-4 w-4" />
              Snapshot + đẩy giám sát
            </Button>
          </div>
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
              void exportExcel(
                () =>
                  downloadContractorPersonnelExcel({
                    from,
                    to,
                    contractorId: contractorId || undefined,
                    projectId: projectId || undefined,
                  }),
                'contractor-personnel.xlsx',
              )
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
        description="Chọn một người để xuất lịch sử riêng; để trống = toàn bộ nhà thầu."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="h-9 min-w-[220px]"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setAccessPage(1);
              }}
            >
              <option value="">Tất cả nhân sự</option>
              {personOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void exportExcel(
                  () =>
                    downloadContractorAccessLogsExcel({
                      from,
                      to,
                      contractorId: contractorId || undefined,
                      projectId: projectId || undefined,
                      userId: userId || undefined,
                    }),
                  userId ? 'lich-su-vao-ra-ca-nhan.xlsx' : 'contractor-access-logs.xlsx',
                )
              }
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </div>
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
              void exportExcel(
                () =>
                  downloadShiftPersonnelExcel({
                    contractorId: contractorId || undefined,
                    workShiftId: workShiftId || undefined,
                    projectId: projectId || undefined,
                  }),
                'shift-personnel.xlsx',
              )
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

      <DesignCard
        title={`Ngày công theo tháng (${month})`}
        description="Tổng kết vào/ra (ngày công) nhân sự nhà thầu trong tháng."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void exportExcel(
                () =>
                  downloadContractorMonthlyExcel({
                    month,
                    contractorId: contractorId || undefined,
                    projectId: projectId || undefined,
                  }),
                `ngay-cong-nha-thau-${month}.xlsx`,
              )
            }
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        }
      >
        <QueryBoundary isLoading={monthlyQuery.isLoading} isEmpty={monthlyRows.length === 0}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-2 font-semibold">Mã</th>
                  <th className="p-2 font-semibold">Họ tên</th>
                  <th className="p-2 font-semibold">Nhà thầu</th>
                  <th className="p-2 text-right font-semibold">Ngày công</th>
                  <th className="p-2 text-right font-semibold">Ngày muộn</th>
                  <th className="p-2 text-right font-semibold">Muộn (p)</th>
                  <th className="p-2 text-right font-semibold">OT (p)</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPaged.pageRows.map((r) => (
                  <tr key={r.userId} className="border-t border-border">
                    <td className="p-2 font-mono text-xs">{r.employeeCode}</td>
                    <td className="p-2">{r.fullName}</td>
                    <td className="p-2 text-xs">{r.contractorName ?? '—'}</td>
                    <td className="p-2 text-right font-semibold">{r.workDays}</td>
                    <td className="p-2 text-right">{r.lateDays}</td>
                    <td className="p-2 text-right">{r.lateMinutes}</td>
                    <td className="p-2 text-right">{r.otMinutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager
            currentPage={monthlyPaged.currentPage}
            totalPages={monthlyPaged.totalPages}
            total={monthlyPaged.total}
            unit="nhân sự"
            onPageChange={setMonthlyPage}
          />
        </QueryBoundary>
      </DesignCard>

      <DesignCard
        title={`Chi tiết vào/ra từng ngày (${month})`}
        description="Excel dạng lưới: mỗi cột một ngày trong tháng, ô = giờ vào–ra."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void exportExcel(
                () =>
                  downloadContractorMonthlyDetailExcel({
                    month,
                    contractorId: contractorId || undefined,
                    projectId: projectId || undefined,
                  }),
                `chi-tiet-ngay-trong-thang-${month}.xlsx`,
              )
            }
          >
            <Download className="h-4 w-4" />
            Excel lưới tháng
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Xuất file Excel cột 1–{monthlyQuery.data?.days ?? 31}: mã NV, họ tên, CCCD, nhà thầu, rồi từng
          ngày (ví dụ 08:01-17:05). Dùng bộ lọc Tháng / Nhà thầu / Dự án phía trên.
        </p>
      </DesignCard>
    </PageShell>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TablePager } from '@/components/ui/table-pager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  getUsers,
  getWorkShifts,
  runContractorSnapshot,
} from '@/lib/api';

const PAGE_SIZE = 10;

type TabId = 'headcount' | 'personnel' | 'access' | 'shift' | 'monthly' | 'monthly-detail';

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

export default function ContractorReportsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>('headcount');

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [contractorId, setContractorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [workShiftId, setWorkShiftId] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [headcountPage, setHeadcountPage] = useState(1);
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
    enabled: tab === 'shift',
  });
  const personOptionsQuery = useQuery({
    queryKey: ['users', 'contractor-report-picker', contractorId, projectId],
    queryFn: () =>
      getUsers({
        page: 1,
        pageSize: 100,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
      }),
    enabled: tab === 'access',
  });

  const headcountQuery = useQuery({
    queryKey: ['contractor-headcount', to, headcountPage],
    queryFn: () =>
      getContractorHeadcount({ date: to, page: headcountPage, pageSize: PAGE_SIZE }),
    enabled: tab === 'headcount',
  });
  const personnelQuery = useQuery({
    queryKey: ['contractor-personnel', from, to, contractorId, projectId, personnelPage],
    queryFn: () =>
      getContractorPersonnel({
        from,
        to,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
        page: personnelPage,
        pageSize: PAGE_SIZE,
      }),
    enabled: tab === 'personnel',
  });
  const accessQuery = useQuery({
    queryKey: ['contractor-access', from, to, contractorId, projectId, userId, accessPage],
    queryFn: () =>
      getContractorAccessLogs({
        from,
        to,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
        userId: userId || undefined,
        page: accessPage,
        pageSize: PAGE_SIZE,
      }),
    enabled: tab === 'access',
  });
  const shiftQuery = useQuery({
    queryKey: ['shift-personnel', contractorId, workShiftId, projectId, shiftPage],
    queryFn: () =>
      getShiftPersonnelReport({
        contractorId: contractorId || undefined,
        workShiftId: workShiftId || undefined,
        projectId: projectId || undefined,
        page: shiftPage,
        pageSize: PAGE_SIZE,
      }),
    enabled: tab === 'shift',
  });
  const monthlyQuery = useQuery({
    queryKey: ['contractor-monthly', month, contractorId, projectId, monthlyPage],
    queryFn: () =>
      getContractorMonthly({
        month,
        contractorId: contractorId || undefined,
        projectId: projectId || undefined,
        page: monthlyPage,
        pageSize: PAGE_SIZE,
      }),
    enabled: tab === 'monthly',
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
      (personOptionsQuery.data?.items ?? [])
        .filter((u) => u.contractorId)
        .map((u) => ({
          id: u.id,
          label: `${u.fullName} (${u.employeeCode || ''})`,
        })),
    [personOptionsQuery.data?.items],
  );

  useEffect(() => {
    const p = searchParams.get('projectId');
    if (p) setProjectId(p);
  }, [searchParams]);

  useEffect(() => {
    setHeadcountPage(1);
  }, [to]);

  useEffect(() => {
    setPersonnelPage(1);
  }, [from, to, contractorId, projectId]);

  useEffect(() => {
    setAccessPage(1);
  }, [from, to, contractorId, projectId, userId]);

  useEffect(() => {
    setUserId('');
  }, [contractorId, projectId]);

  useEffect(() => {
    setShiftPage(1);
  }, [contractorId, workShiftId, projectId]);

  useEffect(() => {
    setMonthlyPage(1);
  }, [month, contractorId, projectId]);

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

  function refreshActive() {
    if (tab === 'headcount') void headcountQuery.refetch();
    else if (tab === 'personnel') void personnelQuery.refetch();
    else if (tab === 'access') void accessQuery.refetch();
    else if (tab === 'shift') void shiftQuery.refetch();
    else if (tab === 'monthly') void monthlyQuery.refetch();
  }

  function renderContractorSelect() {
    return (
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Nhà thầu</label>
        <Select
          className="h-10"
          value={contractorId}
          onChange={(e) => setContractorId(e.target.value)}
        >
          <option value="">Tất cả</option>
          {contractors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  function renderProjectSelect() {
    return (
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Dự án</label>
        <Select className="h-10" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Tất cả</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  return (
    <PageShell
      badge="Báo cáo"
      title="Báo cáo nhà thầu"
      subtitle="Mỗi loại báo cáo một tab — lọc riêng và xuất Excel theo mẫu."
      actions={
        <Button variant="outline" size="sm" onClick={refreshActive}>
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="headcount">Số lượng</TabsTrigger>
          <TabsTrigger value="personnel">Nhân sự</TabsTrigger>
          <TabsTrigger value="access">Vào / ra</TabsTrigger>
          <TabsTrigger value="shift">Theo ca</TabsTrigger>
          <TabsTrigger value="monthly">Ngày công</TabsTrigger>
          <TabsTrigger value="monthly-detail">Lưới tháng</TabsTrigger>
        </TabsList>

        {/* ── Số lượng ── */}
        <TabsContent value="headcount" className="mt-4 space-y-4">
          <DesignCard title="Bộ lọc">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Ngày</label>
                <Input
                  type="date"
                  className="input-design h-10"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
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
            <QueryBoundary isLoading={headcountQuery.isLoading}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="p-2 font-semibold">Nhà thầu</th>
                    <th className="p-2 text-right font-semibold">Đăng ký</th>
                    <th className="p-2 text-right font-semibold">Có mặt</th>
                  </tr>
                </thead>
                <tbody>
                  {headcountRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-sm text-muted-foreground">
                        Chưa có dữ liệu
                      </td>
                    </tr>
                  ) : (
                    headcountRows.map((r) => (
                      <tr key={r.contractorId} className="border-t border-border">
                        <td className="p-2">
                          <span className="font-semibold">{r.name}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {r.code}
                          </span>
                        </td>
                        <td className="p-2 text-right">{r.registeredCount}</td>
                        <td className="p-2 text-right font-semibold">{r.presentCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <TablePager
                currentPage={headcountQuery.data?.page ?? headcountPage}
                totalPages={headcountQuery.data?.totalPages ?? 1}
                total={headcountQuery.data?.total ?? 0}
                unit="nhà thầu"
                onPageChange={setHeadcountPage}
              />
            </QueryBoundary>
          </DesignCard>
        </TabsContent>

        {/* ── Nhân sự ── */}
        <TabsContent value="personnel" className="mt-4 space-y-4">
          <DesignCard title="Bộ lọc">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
                <Input
                  type="date"
                  className="input-design h-10"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Đến ngày</label>
                <Input
                  type="date"
                  className="input-design h-10"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              {renderContractorSelect()}
              {renderProjectSelect()}
            </div>
          </DesignCard>

          <DesignCard
            title="Nhân sự nhà thầu"
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
            <QueryBoundary isLoading={personnelQuery.isLoading}>
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
                    {personnelRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-sm text-muted-foreground">
                          Chưa có dữ liệu
                        </td>
                      </tr>
                    ) : (
                      personnelRows.map((r) => (
                        <tr key={String(r.userId)} className="border-t border-border">
                          <td className="p-2 font-mono text-xs">{String(r.employeeCode ?? '')}</td>
                          <td className="p-2">{String(r.fullName ?? '')}</td>
                          <td className="p-2 font-mono text-xs">{String(r.citizenId ?? '—')}</td>
                          <td className="p-2 text-xs">{String(r.contractorName ?? '—')}</td>
                          <td className="p-2 text-xs">
                            {r.firstCheckInAt
                              ? new Date(String(r.firstCheckInAt)).toLocaleString('vi-VN')
                              : '—'}
                          </td>
                          <td className="p-2 text-xs">
                            {r.lastCheckOutAt
                              ? new Date(String(r.lastCheckOutAt)).toLocaleString('vi-VN')
                              : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePager
                currentPage={personnelQuery.data?.page ?? personnelPage}
                totalPages={personnelQuery.data?.totalPages ?? 1}
                total={personnelQuery.data?.total ?? 0}
                unit="nhân sự"
                onPageChange={setPersonnelPage}
              />
            </QueryBoundary>
          </DesignCard>
        </TabsContent>

        {/* ── Vào / ra ── */}
        <TabsContent value="access" className="mt-4 space-y-4">
          <DesignCard title="Bộ lọc">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
                <Input
                  type="date"
                  className="input-design h-10"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Đến ngày</label>
                <Input
                  type="date"
                  className="input-design h-10"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              {renderContractorSelect()}
              {renderProjectSelect()}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Nhân sự</label>
                <Select
                  className="h-10"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">Tất cả nhân sự</option>
                  {personOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </DesignCard>

          <DesignCard
            title="Lịch sử vào/ra"
            description="Chọn một người để xuất lịch sử riêng; để trống = toàn bộ theo bộ lọc."
            actions={
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
            }
          >
            <QueryBoundary isLoading={accessQuery.isLoading}>
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
                    {accessRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-sm text-muted-foreground">
                          Chưa có dữ liệu
                        </td>
                      </tr>
                    ) : (
                      accessRows.map((r) => (
                        <tr key={String(r.id)} className="border-t border-border">
                          <td className="p-2 text-xs">
                            {r.eventAt
                              ? new Date(String(r.eventAt)).toLocaleString('vi-VN')
                              : '—'}
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
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePager
                currentPage={accessQuery.data?.page ?? accessPage}
                totalPages={accessQuery.data?.totalPages ?? 1}
                total={accessQuery.data?.total ?? 0}
                unit="sự kiện"
                onPageChange={setAccessPage}
              />
            </QueryBoundary>
          </DesignCard>
        </TabsContent>

        {/* ── Theo ca ── */}
        <TabsContent value="shift" className="mt-4 space-y-4">
          <DesignCard title="Bộ lọc">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {renderContractorSelect()}
              {renderProjectSelect()}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Ca</label>
                <Select
                  className="h-10"
                  value={workShiftId}
                  onChange={(e) => setWorkShiftId(e.target.value)}
                >
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
            <QueryBoundary isLoading={shiftQuery.isLoading}>
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
                    {shiftRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-sm text-muted-foreground">
                          Chưa có dữ liệu
                        </td>
                      </tr>
                    ) : (
                      shiftRows.map((r) => (
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
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePager
                currentPage={shiftQuery.data?.page ?? shiftPage}
                totalPages={shiftQuery.data?.totalPages ?? 1}
                total={shiftQuery.data?.total ?? 0}
                unit="phân công"
                onPageChange={setShiftPage}
              />
            </QueryBoundary>
          </DesignCard>
        </TabsContent>

        {/* ── Ngày công ── */}
        <TabsContent value="monthly" className="mt-4 space-y-4">
          <DesignCard title="Bộ lọc">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Tháng</label>
                <Input
                  type="month"
                  className="input-design h-10"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
              {renderContractorSelect()}
              {renderProjectSelect()}
            </div>
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
            <QueryBoundary isLoading={monthlyQuery.isLoading}>
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
                    {monthlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-sm text-muted-foreground">
                          Chưa có dữ liệu
                        </td>
                      </tr>
                    ) : (
                      monthlyRows.map((r) => (
                        <tr key={r.userId} className="border-t border-border">
                          <td className="p-2 font-mono text-xs">{r.employeeCode}</td>
                          <td className="p-2">{r.fullName}</td>
                          <td className="p-2 text-xs">{r.contractorName ?? '—'}</td>
                          <td className="p-2 text-right font-semibold">{r.workDays}</td>
                          <td className="p-2 text-right">{r.lateDays}</td>
                          <td className="p-2 text-right">{r.lateMinutes}</td>
                          <td className="p-2 text-right">{r.otMinutes}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePager
                currentPage={monthlyQuery.data?.page ?? monthlyPage}
                totalPages={monthlyQuery.data?.totalPages ?? 1}
                total={monthlyQuery.data?.total ?? 0}
                unit="nhân sự"
                onPageChange={setMonthlyPage}
              />
            </QueryBoundary>
          </DesignCard>
        </TabsContent>

        {/* ── Lưới tháng (Excel) ── */}
        <TabsContent value="monthly-detail" className="mt-4 space-y-4">
          <DesignCard title="Bộ lọc">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Tháng</label>
                <Input
                  type="month"
                  className="input-design h-10"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
              {renderContractorSelect()}
              {renderProjectSelect()}
            </div>
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
              Xuất file Excel: mã NV, họ tên, CCCD, nhà thầu, rồi từng ngày trong tháng (ví dụ
              08:01-17:05). Dùng bộ lọc Tháng / Nhà thầu / Dự án phía trên rồi bấm xuất.
            </p>
          </DesignCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

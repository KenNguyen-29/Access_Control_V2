'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Siren,
  Users,
  MapPin,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell, DesignCard } from '@/components/design/PageShell';
import { QueryBoundary } from '@/components/ui/query-states';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  endEmergency,
  getEmergencyDashboard,
  triggerEmergencyDrill,
  updateMusterStatus,
} from '@/lib/api';

export default function MusterPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.emergencyDashboard(),
    queryFn: () => getEmergencyDashboard(),
    refetchInterval: 10000,
  });

  const muster = dashboardQuery.data?.muster ?? [];
  const event = dashboardQuery.data?.event;
  const eventActive = !!event && !event.endTime;
  const eventId = event?.id ?? null;
  const loading = dashboardQuery.isLoading;
  const displayError =
    error ??
    (dashboardQuery.error instanceof ApiError
      ? dashboardQuery.error.message
      : dashboardQuery.error
        ? 'Không tải được dashboard sơ tán'
        : null);

  function loadDashboard() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.emergencyDashboard() });
  }

  const inside = muster.filter((m) => m.safeStatus === 'INSIDE');
  const mustered = muster.filter((m) => m.safeStatus === 'SAFE');

  const markSafeMutation = useMutation({
    mutationFn: (musterId: string) =>
      updateMusterStatus(musterId, {
        safeStatus: 'SAFE',
        remarks: 'Đã xác nhận an toàn qua UI',
      }),
    onSuccess: () => {
      setNotice('Đã xác nhận an toàn');
      void queryClient.invalidateQueries({ queryKey: queryKeys.emergencyDashboard() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Cập nhật thất bại'),
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => endEmergency(id),
    onSuccess: () => {
      setNotice('Đã kết thúc sự kiện khẩn cấp');
      void queryClient.invalidateQueries({ queryKey: queryKeys.emergencyDashboard() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Kết thúc thất bại'),
  });

  const drillMutation = useMutation({
    mutationFn: () => triggerEmergencyDrill('Diễn tập từ giao diện sơ tán'),
    onSuccess: () => {
      setNotice('Đã kích hoạt diễn tập khẩn cấp');
      void queryClient.invalidateQueries({ queryKey: queryKeys.emergencyDashboard() });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Kích hoạt thất bại'),
  });

  const acting = markSafeMutation.isPending || endMutation.isPending || drillMutation.isPending;

  function markSafe(musterId: string) {
    setNotice(null);
    markSafeMutation.mutate(musterId);
  }

  function handleEndEmergency() {
    if (!eventId) return;
    if (!confirm('Kết thúc sự kiện khẩn cấp?')) return;
    setNotice(null);
    endMutation.mutate(eventId);
  }

  function handleDrill() {
    if (!confirm('Kích hoạt diễn tập sơ tán (FACP)?')) return;
    setNotice(null);
    drillMutation.mutate();
  }

  return (
    <PageShell
      title="Sơ tán khẩn cấp"
      subtitle="Dashboard điểm danh khi kích hoạt báo cháy (FACP) — theo dõi nhân sự còn trong vùng nguy hiểm."
      badge="Emergency Muster"
      actions={
        <div className="flex gap-2">
          {!eventActive && (
            <Button variant="outline" size="sm" disabled={acting} onClick={() => handleDrill()}>
              <Siren className="h-4 w-4" />
              Diễn tập FACP
            </Button>
          )}
          {eventActive && eventId ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={acting}
              onClick={() => handleEndEmergency()}
            >
              <Siren className="h-4 w-4" />
              Kết thúc khẩn cấp
            </Button>
          ) : null}
        </div>
      }
    >
      {notice && (
        <p className="rounded-sm border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      <QueryBoundary isLoading={loading} error={displayError} onRetry={() => loadDashboard()}>
        {eventActive && (
          <div className="mb-6 flex items-center gap-3 rounded-sm border-2 border-destructive/50 bg-destructive/5 p-4">
            <AlertTriangle className="h-6 w-6 shrink-0 text-destructive" />
            <div>
              <p className="font-heading font-bold text-destructive">
                CHẾ ĐỘ KHẨN CẤP ĐANG HOẠT ĐỘNG
              </p>
              <p className="text-sm text-muted-foreground">
                Tín hiệu FACP nhận — vui lòng điều phối sơ tán và xác nhận điểm tập kết.
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Còn trong vùng nguy hiểm', value: inside.length, icon: Users, warn: true },
            { label: 'Đã đến điểm tập kết', value: mustered.length, icon: CheckCircle2, warn: false },
            { label: 'Tổng theo dõi', value: muster.length, icon: MapPin, warn: false },
            {
              label: 'Trạng thái FACP',
              value: eventActive ? 'ACTIVE' : 'Standby',
              icon: Siren,
              warn: eventActive,
            },
          ].map((s) => (
            <DesignCard key={s.label} className={cn(s.warn && eventActive && 'border-destructive/40')}>
              <div className="flex items-center gap-3">
                <s.icon
                  className={cn(
                    'h-8 w-8',
                    s.warn && eventActive ? 'text-destructive' : 'text-primary',
                  )}
                />
                <div>
                  <p className="font-heading text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </DesignCard>
          ))}
        </div>

        {!eventActive && muster.length === 0 ? (
          <DesignCard title="Không có sự kiện khẩn cấp">
            <p className="text-sm text-muted-foreground">
              Hệ thống đang ở trạng thái chờ. Dùng nút &quot;Diễn tập FACP&quot; để mô phỏng, hoặc
              kích hoạt qua webhook khẩn cấp.
            </p>
          </DesignCard>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <DesignCard title="Danh sách cứu hộ" description="Nhân sự còn trong khu vực nguy hiểm">
              {inside.length === 0 ? (
                <p className="py-4 text-sm italic text-muted-foreground">
                  Không còn nhân sự trong vùng nguy hiểm.
                </p>
              ) : (
                <div className="space-y-3">
                  {inside.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-sm border border-border p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">{p.user?.fullName ?? p.userId}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.user?.employeeCode ?? p.userId}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="accent"
                        disabled={acting}
                        onClick={() => markSafe(p.id)}
                      >
                        Đã an toàn
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </DesignCard>

            <DesignCard title="Điểm tập kết" description="Xác nhận có mặt tại muster point">
              {mustered.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">Chưa có ai xác nhận an toàn.</p>
              ) : (
                <div className="space-y-3">
                  {mustered.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-sm border border-border bg-primary/5 p-3"
                    >
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                      <div>
                        <p className="text-sm font-semibold">{p.user?.fullName ?? p.userId}</p>
                        <p className="text-xs text-muted-foreground">{p.remarks || 'SAFE'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DesignCard>
          </div>
        )}
      </QueryBoundary>
    </PageShell>
  );
}

'use client';

import { useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QueryBoundary } from '@/components/ui/query-states';
import { AddAccessGroupPanel } from '@/components/access-control/AddAccessGroupPanel';
import { AccessSyncReportPanel } from '@/components/access-control/AccessSyncReport';
import { useAccessControl } from '@/hooks/useAccessControl';
import type { AccessGroup } from '@/lib/accessControl';
import type { AccessSyncReport } from '@/lib/accessSync';
import { cn } from '@/lib/utils';

function statusLabel(s: AccessGroup['status']) {
  if (s === 'applied') return 'Đã áp dụng';
  if (s === 'partial') return 'Một phần';
  if (s === 'failed') return 'Thất bại';
  return 'Chờ áp dụng';
}

export function AccessGroupPanel() {
  const {
    groups,
    loading,
    error,
    applying,
    refetch,
    accessPointOptions,
    scheduleTemplates,
    saveGroup,
    deleteGroups,
    applyGroups,
  } = useAccessControl();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState<AccessGroup | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<AccessGroup | null>(null);
  const [personFilter, setPersonFilter] = useState('');
  const [pointFilter, setPointFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<AccessSyncReport | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSaveGroup = async (data: Omit<AccessGroup, 'id' | 'status'>) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await saveGroup(data, editGroup?.id);
      setNotice('Đã lưu nhóm khu vực');
      setEditGroup(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Lưu thất bại');
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    if (!window.confirm(`Xóa phân quyền của ${selectedIds.length} khu vực đã chọn?`)) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await deleteGroups(selectedIds);
      if (activeGroup && selectedIds.includes(activeGroup.id)) setActiveGroup(null);
      setSelectedIds([]);
      setNotice('Đã xóa phân quyền thành viên');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Xóa thất bại');
    } finally {
      setBusy(false);
    }
  };

  const runApply = async (ids: string[]) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await applyGroups(ids);
      setSyncReport(result);
      if (result.success) {
        setNotice('Đã đồng bộ credentials xuống thiết bị');
      } else if (result.synced > 0) {
        setActionError('Đồng bộ một phần — xem chi tiết bên dưới');
      } else {
        setActionError('Đồng bộ thất bại');
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Đồng bộ thất bại');
    } finally {
      setBusy(false);
    }
  };

  const filteredPersons =
    activeGroup?.persons.filter(
      (p) =>
        p.name.toLowerCase().includes(personFilter.toLowerCase()) ||
        p.personId.toLowerCase().includes(personFilter.toLowerCase()),
    ) ?? [];

  const filteredPoints =
    activeGroup?.accessPoints.filter(
      (p) =>
        p.name.toLowerCase().includes(pointFilter.toLowerCase()) ||
        p.groupName.toLowerCase().includes(pointFilter.toLowerCase()),
    ) ?? [];

  return (
    <QueryBoundary isLoading={loading} error={error} onRetry={refetch}>
      <div className="relative flex h-full min-h-0">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card p-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditGroup(null);
                setAddOpen(true);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Thêm
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.length === 0 || busy}
              onClick={() => void deleteSelected()}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Xóa
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={groups.length === 0 || busy || applying}
              onClick={() => void runApply(groups.map((g) => g.id))}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Đồng bộ tất cả
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.length === 0 || busy || applying}
              onClick={() => void runApply(selectedIds)}
            >
              Đồng bộ đã chọn
            </Button>
          </div>

          {(notice || actionError) && (
            <div className="shrink-0 space-y-1 border-b border-border px-3 py-2">
              {notice && <p className="text-xs text-emerald-600">{notice}</p>}
              {actionError && <p className="text-xs text-destructive">{actionError}</p>}
            </div>
          )}

          <AccessSyncReportPanel report={syncReport} className="mx-2 mt-2" />

          <div className="flex min-h-0 flex-1">
            <div className="w-64 shrink-0 overflow-y-auto border-r border-border">
              {groups.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Không có dữ liệu</p>
              ) : (
                groups.map((g) => (
                  <div
                    key={g.id}
                    className={cn(
                      'flex w-full items-start gap-2 border-b border-border px-3 py-2 text-sm',
                      activeGroup?.id === g.id && 'bg-primary/5',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-primary"
                      checked={selectedIds.includes(g.id)}
                      onChange={() => toggleSelect(g.id)}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left hover:opacity-80"
                      onClick={() => setActiveGroup(g)}
                    >
                      <div className="truncate font-medium">{g.name}</div>
                      <div className="text-xs text-muted-foreground">{statusLabel(g.status)}</div>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {activeGroup ? (
                <>
                  <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
                    <div>
                      <h3 className="font-bold">{activeGroup.name}</h3>
                      <p
                        className="cursor-help text-xs text-muted-foreground"
                        title="Lịch được lưu theo khu vực trong cấu hình hệ thống"
                      >
                        Lịch khu vực: {activeGroup.scheduleTemplate}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditGroup(activeGroup);
                        setAddOpen(true);
                      }}
                    >
                      Sửa
                    </Button>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
                    <div className="flex min-h-0 flex-col border-r border-border">
                      <div className="shrink-0 border-b border-border p-2">
                        <Input
                          placeholder="Lọc nhân viên..."
                          value={personFilter}
                          onChange={(e) => setPersonFilter(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 text-sm">
                        {filteredPersons.map((p) => (
                          <div key={p.id} className="border-b border-border/50 py-1.5">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.personId} · {p.organization}
                            </div>
                          </div>
                        ))}
                        {filteredPersons.length === 0 && (
                          <p className="py-4 text-xs text-muted-foreground">Không có nhân viên</p>
                        )}
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-col">
                      <div className="shrink-0 border-b border-border p-2">
                        <Input
                          placeholder="Lọc điểm truy cập..."
                          value={pointFilter}
                          onChange={(e) => setPointFilter(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 text-sm">
                        {filteredPoints.map((p) => (
                          <div key={p.id} className="border-b border-border/50 py-1.5">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.groupName}</div>
                          </div>
                        ))}
                        {filteredPoints.length === 0 && (
                          <p className="py-4 text-xs text-muted-foreground">Không có thiết bị</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Chọn một khu vực để xem chi tiết
                </div>
              )}
            </div>
          </div>
        </div>

        <AddAccessGroupPanel
          open={addOpen}
          onClose={() => {
            setAddOpen(false);
            setEditGroup(null);
          }}
          onSave={handleSaveGroup}
          editGroup={editGroup}
          accessPointOptions={accessPointOptions}
          scheduleTemplates={scheduleTemplates}
          saving={busy}
        />
      </div>
    </QueryBoundary>
  );
}

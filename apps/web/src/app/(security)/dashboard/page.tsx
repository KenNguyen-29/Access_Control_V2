'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Monitor,
  Video,
  Search,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Maximize,
} from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover } from '@/components/ui/popover';
import {
  getDevices,
  getEmergencyDashboard,
  updateMusterStatus,
  type Device,
} from '@/lib/api';
import EventPopup from './components/EventPopup';
import CheckinToast from './components/CheckinToast';
import MiniAccessLog from './components/MiniAccessLog';
import AttendanceBoard from './components/AttendanceBoard';
import type { EmergencyOverlayPerson } from './components/EmergencyOverlay';
import { DEMO_CAMERAS, type CameraItem } from './components/CameraGrid';

// Full-screen FIRE overlay is rarely shown; keep it out of the initial dashboard bundle.
const EmergencyOverlay = dynamic(() => import('./components/EmergencyOverlay'), { ssr: false });

const CameraGrid = dynamic(() => import('./components/CameraGrid'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-400">
      Đang tải camera...
    </div>
  ),
});

const CameraDetailModal = dynamic(
  () => import('./components/CameraGrid').then((m) => m.CameraDetailModal),
  { ssr: false },
);

const LAYOUTS = [
  { value: 1, label: '1×1' },
  { value: 4, label: '2×2' },
  { value: 6, label: '2×3' },
  { value: 9, label: '3×3' },
  { value: 16, label: '4×4' },
];

export default function DashboardPage() {
  const { connected, lastEvent, fireEmergency, setFireEmergency } = useSocket();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cameras, setCameras] = useState<CameraItem[]>(DEMO_CAMERAS);
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState<string>(DEMO_CAMERAS[0]?.code ?? '');
  const [layout, setLayout] = useState<number>(4);
  const [tab, setTab] = useState('events');
  const [detailCam, setDetailCam] = useState<CameraItem | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyPeople, setEmergencyPeople] = useState<EmergencyOverlayPerson[]>([]);

  const applyEmergencyPeople = useCallback((people: EmergencyOverlayPerson[]) => {
    setEmergencyPeople(people);
    const hasInside = people.some(
      (p) => p.safeStatus === 'INSIDE' || p.safeStatus === 'MISSING',
    );
    if (hasInside || people.length > 0) {
      setEmergencyOpen(true);
    }
  }, []);

  useEffect(() => {
    getDevices({ page: 1, pageSize: 100 })
      .then((res) => {
        const cams = res.items
          .filter((d: Device) => d.deviceType === 'CAMERA')
          .map<CameraItem>((d) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            location: d.location ?? undefined,
            ip: d.ipAddress ?? undefined,
            online: d.isOnline ?? false,
          }));
        if (cams.length > 0) {
          setCameras(cams);
          setSelectedCode(cams[0].code);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getEmergencyDashboard()
      .then((data) => {
        if (!data.event || data.event.endTime) return;
        applyEmergencyPeople(
          data.muster.map((m) => ({
            musterId: m.id,
            userId: m.userId,
            fullName: m.user?.fullName ?? m.userId,
            employeeCode: m.user?.employeeCode,
            safeStatus: m.safeStatus,
          })),
        );
      })
      .catch(() => {});
  }, [applyEmergencyPeople]);

  useEffect(() => {
    if (!fireEmergency) return;
    applyEmergencyPeople(
      fireEmergency.people.map((p) => ({
        musterId: p.musterId,
        userId: p.userId,
        fullName: p.fullName,
        employeeCode: p.employeeCode,
        safeStatus: p.safeStatus,
      })),
    );
  }, [fireEmergency, applyEmergencyPeople]);

  async function handleMarkSafe(musterId: string) {
    try {
      await updateMusterStatus(musterId, {
        safeStatus: 'SAFE',
        remarks: 'Marked safe via dashboard overlay',
      });
      setEmergencyPeople((prev) =>
        prev.map((p) =>
          p.musterId === musterId ? { ...p, safeStatus: 'SAFE' } : p,
        ),
      );
      setFireEmergency((prev) =>
        prev
          ? {
              ...prev,
              people: prev.people.map((p) =>
                p.musterId === musterId ? { ...p, safeStatus: 'SAFE' } : p,
              ),
            }
          : prev,
      );
    } catch {
      /* ignore */
    }
  }

  const filteredCameras = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cameras;
    return cameras.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.location || '').toLowerCase().includes(q),
    );
  }, [cameras, search]);

  const gridCameras = useMemo(() => {
    const selected = cameras.find((c) => c.code === selectedCode);
    if (!selected) return cameras;
    return [selected, ...cameras.filter((c) => c.code !== selectedCode)];
  }, [cameras, selectedCode]);

  const selectedCam = cameras.find((c) => c.code === selectedCode);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-neutral">
      {/* Left camera sidebar */}
      <aside
        className={cn(
          'flex shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-0',
        )}
      >
        <div className="flex items-center justify-between border-b border-border bg-neutral px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">
              Danh sách camera
            </span>
          </div>
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase',
              connected ? 'bg-primary/15 text-primary' : 'bg-destructive/10 text-destructive',
            )}
          >
            {connected ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="border-b border-border p-2">
          <div className="group relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary" />
            <Input
              placeholder="Tìm camera..."
              className="h-8 border-slate-200 bg-slate-50 pl-3 pr-9 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {filteredCameras.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">Không có camera</p>
          )}
          {filteredCameras.map((cam) => (
            <button
              key={cam.code}
              type="button"
              onClick={() => setSelectedCode(cam.code)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left transition-all',
                selectedCode === cam.code ? 'bg-secondary/20' : 'hover:bg-slate-100',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full ring-2 ring-offset-1',
                  cam.online ? 'bg-emerald-500 ring-emerald-500/20' : 'bg-slate-300 ring-slate-300/20',
                )}
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-600 group-hover:text-slate-900">
                {cam.name}
              </span>
              <Video className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-primary" />
            </button>
          ))}
        </div>
      </aside>

      {/* Center grid */}
      <section className="relative flex min-w-0 flex-1 flex-col bg-slate-100">
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute left-0 top-1/2 z-20 flex h-10 w-3 -translate-y-1/2 items-center justify-center rounded-r border border-l-0 border-slate-200 bg-white shadow-sm hover:bg-slate-50"
          title={sidebarOpen ? 'Ẩn danh sách' : 'Hiện danh sách'}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-3 w-3 text-slate-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-slate-500" />
          )}
        </button>

        <CheckinToast event={lastEvent} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <CameraGrid
            cameras={gridCameras}
            layout={layout}
            selectedCode={selectedCode}
            onSelect={setSelectedCode}
            onExpand={setDetailCam}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex h-12 shrink-0 items-center justify-between border-t border-slate-300 bg-[#f0f2f5] px-4">
          <span className="truncate text-xs font-medium text-slate-600">
            {selectedCam?.name ?? 'Giám sát'}
            {selectedCam?.location ? ` · ${selectedCam.location}` : ''}
          </span>
          <div className="flex items-center gap-1">
            <Popover
              align="end"
              className="w-[220px] border-slate-800 bg-[#0a0c10] p-3"
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <LayoutGrid className="h-4 w-4" />
                  {LAYOUTS.find((l) => l.value === layout)?.label}
                </button>
              )}
            >
              {({ close }) => (
                <div className="grid grid-cols-3 gap-2">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => {
                        setLayout(l.value);
                        close();
                      }}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-sm border p-2 text-[10px] font-bold text-slate-300 transition-colors',
                        layout === l.value
                          ? 'border-primary bg-primary/20 text-white'
                          : 'border-slate-700 hover:bg-slate-800',
                      )}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <button
              type="button"
              onClick={() => selectedCam && setDetailCam(selectedCam)}
              disabled={!selectedCam}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Xem chi tiết camera đang chọn"
            >
              <Maximize className="h-4 w-4" />
              Chi tiết
            </button>
            <button
              type="button"
              onClick={() => document.documentElement.requestFullscreen?.()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              title="Toàn màn hình"
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Right panel */}
      <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface lg:w-96">
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border p-2">
            <TabsList className="w-full">
              <TabsTrigger value="events">Sự kiện</TabsTrigger>
              <TabsTrigger value="attendance">Điểm danh</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="events" className="mt-0 flex min-h-0 flex-1 flex-col">
            <EventPopup event={lastEvent} />
            <MiniAccessLog />
          </TabsContent>

          <TabsContent value="attendance" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3">
            <AttendanceBoard />
          </TabsContent>
        </Tabs>
      </aside>

      {detailCam && <CameraDetailModal cam={detailCam} onClose={() => setDetailCam(null)} />}

      <EmergencyOverlay
        open={emergencyOpen}
        people={emergencyPeople}
        onMarkSafe={(id) => void handleMarkSafe(id)}
        onClose={() => {
          setEmergencyOpen(false);
          setFireEmergency(null);
        }}
      />
    </div>
  );
}

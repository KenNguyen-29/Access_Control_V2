'use client';

import { useEffect, useRef } from 'react';
import { Flame, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EmergencyOverlayPerson = {
  musterId: string;
  userId: string;
  fullName: string;
  employeeCode?: string;
  safeStatus: string;
};

interface EmergencyOverlayProps {
  open: boolean;
  people: EmergencyOverlayPerson[];
  onMarkSafe: (musterId: string) => void;
  onClose: () => void;
}

export default function EmergencyOverlay({
  open,
  people,
  onMarkSafe,
  onClose,
}: EmergencyOverlayProps) {
  const alarmRef = useRef<OscillatorNode | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      try {
        alarmRef.current?.stop();
      } catch {
        /* ignore */
      }
      alarmRef.current = null;
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const inside = people.filter((p) => p.safeStatus === 'INSIDE' || p.safeStatus === 'MISSING');

  return (
    <div
      className={cn(
        'fixed inset-0 z-[99999] flex flex-col items-center justify-start bg-red-800/98 p-6 text-white',
      )}
    >
      <div className="mb-4 flex w-full max-w-6xl items-center justify-between rounded-sm bg-red-900/90 p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Flame className="mt-1 h-10 w-10 shrink-0 animate-pulse" />
          <div>
            <div className="text-4xl font-extrabold tracking-tight">FIRE EMERGENCY</div>
            <div className="mt-1 text-sm opacity-90">
              Tín hiệu FIRE_EMERGENCY nhận được. Ghi nhận và điểm danh ngay.
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-5xl font-bold">{inside.length}</div>
          <div className="text-sm opacity-90">Còn trong nguy hiểm</div>
        </div>
      </div>

      <div
        className="w-full max-w-6xl overflow-y-auto rounded-sm bg-white/5 p-3 shadow-inner"
        style={{ maxHeight: '70vh' }}
      >
        {inside.length === 0 ? (
          <p className="py-8 text-center text-sm opacity-80">
            Tất cả nhân sự đã được đánh dấu an toàn.
          </p>
        ) : (
          inside.map((p) => (
            <div
              key={p.musterId}
              className="flex items-center justify-between gap-4 border-b border-white/10 p-2"
            >
              <div>
                <div className="font-bold">{p.fullName}</div>
                <div className="text-sm opacity-90">{p.employeeCode || p.userId}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={() => onMarkSafe(p.musterId)}
              >
                Đã an toàn
              </Button>
            </div>
          ))
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-white/40 bg-transparent text-white hover:bg-white/10"
            onClick={() => {
              if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen?.();
              }
            }}
          >
            Toàn màn hình
          </Button>
          <Button
            size="sm"
            className="bg-white/20 text-white hover:bg-white/30"
            onClick={() => {
              try {
                const Ctx =
                  window.AudioContext ||
                  (window as unknown as { webkitAudioContext: typeof AudioContext })
                    .webkitAudioContext;
                const ctx = new Ctx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 540;
                gain.gain.value = 0.03;
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                alarmRef.current = osc;
              } catch {
                /* ignore */
              }
            }}
          >
            Phát báo động
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}

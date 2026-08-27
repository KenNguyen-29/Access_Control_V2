'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Maximize2, Loader2, VideoOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError, exchangeDeviceWebRtc } from '@/lib/api';

type PlaybackState = 'connecting' | 'live' | 'offline';
type LinkState = 'unknown' | 'up' | 'down';

type StreamDiag = {
  network: LinkState;
  rtsp: LinkState;
  playback: PlaybackState;
  reason: string | null;
};

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export type CameraItem = {
  id?: string;
  code: string;
  name: string;
  location?: string;
  ip?: string;
  /** Network reachability from device check (ping/TCP). */
  online?: boolean;
};

/** Spread out simultaneous connects a little so we don't hammer go2rtc at once. */
function connectDelayMs(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return (hash % 5) * 500;
}

/**
 * The backend performs a single non-trickle SDP exchange. Wait until the
 * browser has appended its host candidates before sending the offer; sending
 * the initial SDP immediately leaves ICE with no usable remote candidates.
 */
function waitForIceGatheringComplete(
  connection: RTCPeerConnection,
  timeoutMs = 5000,
): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(done, timeoutMs);

    const onStateChange = () => {
      if (connection.iceGatheringState === 'complete') done();
    };

    function done() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      connection.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    }

    connection.addEventListener('icegatheringstatechange', onStateChange);
  });
}

/**
 * Connects a camera's WebRTC stream into a <video> via backend-proxied SDP
 * (POST /devices/:id/webrtc → go2rtc). Shared by the grid slots and the
 * single-camera detail view.
 */
function useCameraStream(cam: CameraItem, enabled = true) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [diag, setDiag] = useState<StreamDiag>({
    network: cam.online === false ? 'down' : cam.online ? 'up' : 'unknown',
    rtsp: 'unknown',
    playback: 'connecting',
    reason: null,
  });

  useEffect(() => {
    if (!enabled) return;
    if (!cam.id) {
      setDiag({
        network: 'unknown',
        rtsp: 'down',
        playback: 'offline',
        reason: 'Chưa gắn thiết bị camera',
      });
      return;
    }

    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    const deviceId = cam.id;
    const network: LinkState = cam.online === false ? 'down' : cam.online ? 'up' : 'unknown';
    setDiag({
      network,
      rtsp: 'unknown',
      playback: 'connecting',
      reason: network === 'down' ? 'Mạng thiết bị không phản hồi (ping/TCP)' : null,
    });

    const connect = async () => {
      if (cancelled) return;
      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc = connection;

      connection.addTransceiver('video', { direction: 'recvonly' });
      connection.addTransceiver('audio', { direction: 'recvonly' });

      connection.ontrack = (event) => {
        const video = videoRef.current;
        const stream = event.streams[0];
        if (!video || !stream || cancelled) return;
        video.srcObject = stream;
        void video.play().catch(() => undefined);
        setDiag({
          network: 'up',
          rtsp: 'up',
          playback: 'live',
          reason: null,
        });
      };

      connection.onconnectionstatechange = () => {
        if (cancelled) return;
        const s = connection.connectionState;
        if (s === 'connected') {
          setDiag((prev) => ({
            ...prev,
            network: 'up',
            rtsp: 'up',
            playback: 'live',
            reason: null,
          }));
        } else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
          setDiag((prev) => ({
            ...prev,
            playback: 'offline',
            reason:
              s === 'failed'
                ? 'WebRTC playback thất bại (ICE/DTLS)'
                : 'Phiên phát bị ngắt kết nối',
          }));
        }
      };

      try {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await waitForIceGatheringComplete(connection);
        const localDescription = connection.localDescription;
        if (cancelled || !localDescription?.sdp) return;

        const answer = await exchangeDeviceWebRtc(deviceId, {
          type: localDescription.type,
          sdp: localDescription.sdp,
        });
        if (cancelled) return;

        setDiag((prev) => ({
          ...prev,
          rtsp: 'up',
          reason: prev.playback === 'live' ? null : 'Đã nhận SDP từ go2rtc — chờ track video',
        }));

        await connection.setRemoteDescription({ type: answer.type as RTCSdpType, sdp: answer.sdp });
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Không trao đổi được SDP với go2rtc/RTSP';
        setDiag({
          network,
          rtsp: 'down',
          playback: 'offline',
          reason: `RTSP/go2rtc: ${msg}`,
        });
      }
    };

    startTimer = setTimeout(() => void connect(), connectDelayMs(deviceId));

    return () => {
      cancelled = true;
      if (startTimer) clearTimeout(startTimer);
      pc?.close();
    };
  }, [cam.id, cam.code, cam.online, enabled]);

  return { videoRef, diag, state: diag.playback };
}

function linkLabel(s: LinkState) {
  if (s === 'up') return 'OK';
  if (s === 'down') return 'Lỗi';
  return '…';
}

// Camera data always comes from the API. Keeping this empty avoids showing
// site-specific demo IPs when the API is unavailable during deployment.
export const DEMO_CAMERAS: CameraItem[] = [];

const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  4: 'grid-cols-2',
  6: 'grid-cols-3',
  9: 'grid-cols-3',
  16: 'grid-cols-4',
};

export default function CameraGrid({
  cameras,
  layout = 4,
  selectedCode,
  onSelect,
  onExpand,
}: {
  cameras: CameraItem[];
  layout?: number;
  selectedCode?: string | null;
  onSelect?: (code: string) => void;
  onExpand?: (cam: CameraItem) => void;
}) {
  const slots = Array.from({ length: layout }).map((_, i) => cameras[i] ?? null);

  return (
    <div className={cn('grid h-full w-full content-center gap-0.5 p-0.5', GRID_COLS[layout] ?? 'grid-cols-3')}>
      {slots.map((cam, i) =>
        cam ? (
          <CameraSlot
            key={cam.code}
            cam={cam}
            selected={cam.code === selectedCode}
            onClick={() => onSelect?.(cam.code)}
            onExpand={onExpand ? () => onExpand(cam) : undefined}
          />
        ) : (
          <EmptySlot key={`empty-${i}`} />
        ),
      )}
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden border border-slate-800 bg-[#0a0c10]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden">
        <div className="h-1/3 w-full animate-scan bg-gradient-to-b from-transparent via-primary/10 to-transparent" />
      </div>
      <div className="flex flex-col items-center gap-2 text-slate-600">
        <Monitor className="h-6 w-6 opacity-40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Mất tín hiệu</span>
      </div>
      <Corner className="left-1 top-1 border-l border-t" />
      <Corner className="right-1 top-1 border-r border-t" />
      <Corner className="bottom-1 left-1 border-b border-l" />
      <Corner className="bottom-1 right-1 border-b border-r" />
    </div>
  );
}

function Corner({ className }: { className?: string }) {
  return <span className={cn('absolute h-3 w-3 border-white/10', className)} />;
}

function StatusDot({ state }: { state: PlaybackState }) {
  return (
    <span
      className={cn(
        'h-1.5 w-1.5 rounded-full',
        state === 'live'
          ? 'animate-pulse bg-red-500'
          : state === 'connecting'
            ? 'animate-pulse bg-amber-400'
            : 'bg-slate-500',
      )}
    />
  );
}

function StreamOverlay({ diag }: { diag: StreamDiag }) {
  if (diag.playback === 'live') return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a0c10] px-3 text-center text-slate-500">
      {diag.playback === 'connecting' ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-primary/70" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Đang kết nối</span>
        </>
      ) : (
        <>
          <VideoOff className="h-6 w-6 opacity-40" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Mất tín hiệu</span>
          {diag.reason && (
            <span className="max-w-[90%] text-[10px] leading-snug text-slate-400">{diag.reason}</span>
          )}
        </>
      )}
    </div>
  );
}

function DiagBadges({ diag }: { diag: StreamDiag }) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1">
      <span className="rounded-sm border border-white/10 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-white/80">
        Net {linkLabel(diag.network)}
      </span>
      <span className="rounded-sm border border-white/10 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-white/80">
        RTSP {linkLabel(diag.rtsp)}
      </span>
      <span className="rounded-sm border border-white/10 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-white/80">
        Play {diag.playback === 'live' ? 'OK' : diag.playback === 'connecting' ? '…' : 'Lỗi'}
      </span>
    </div>
  );
}

function CameraSlot({
  cam,
  selected,
  onClick,
  onExpand,
}: {
  cam: CameraItem;
  selected?: boolean;
  onClick?: () => void;
  onExpand?: () => void;
}) {
  const { videoRef, diag, state } = useCameraStream(cam);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'group relative aspect-video w-full cursor-pointer overflow-hidden border bg-slate-950 text-left outline-none',
        selected
          ? 'z-10 border-2 border-primary shadow-[0_0_15px_rgba(17,152,97,0.35)] ring-1 ring-primary/50'
          : 'border-slate-800',
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn('h-full w-full object-cover', state === 'live' ? 'opacity-100' : 'opacity-0')}
      />

      <StreamOverlay diag={diag} />

      {/* Top overlay: status + name */}
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-sm border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur-md">
        <StatusDot state={state} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-white">
          {cam.name}
          {state === 'live' ? ' · LIVE' : state === 'connecting' ? ' · ...' : ' · OFF'}
        </span>
      </div>

      {/* Expand button — opens the single-camera detail view */}
      {onExpand && (
        <button
          type="button"
          title="Xem chi tiết camera"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 bg-black/40 text-white/80 opacity-0 backdrop-blur-md transition-opacity hover:bg-black/70 hover:text-white group-hover:opacity-100"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}

      <DiagBadges diag={diag} />

      {/* Hover overlay: IP */}
      {cam.ip && (
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2 rounded-sm border border-white/10 bg-black/40 px-2 py-1 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
          <span className="font-mono text-[10px] text-white/80">{cam.ip}</span>
        </div>
      )}

      <Corner className="left-1 top-1 border-l border-t" />
      <Corner className="right-1 top-1 border-r border-t" />
      <Corner className="bottom-1 left-1 border-b border-l" />
      <Corner className="bottom-1 right-1 border-b border-r" />
    </div>
  );
}

/** Full single-camera detail view (modal overlay) for close inspection / testing. */
export function CameraDetailModal({ cam, onClose }: { cam: CameraItem; onClose: () => void }) {
  const { videoRef, diag, state } = useCameraStream(cam);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const playbackLabel =
    state === 'live' ? 'LIVE' : state === 'connecting' ? 'Đang kết nối' : 'Mất tín hiệu';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-md border border-slate-800 bg-[#0a0c10] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <StatusDot state={state} />
              <span className="text-sm font-semibold text-white">{cam.name}</span>
              <span
                className={cn(
                  'rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase',
                  state === 'live'
                    ? 'bg-red-500/20 text-red-300'
                    : state === 'connecting'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-700/40 text-slate-400',
                )}
              >
                {playbackLabel}
              </span>
            </div>
            <p className="font-mono text-[11px] text-slate-400">
              Net {linkLabel(diag.network)} · RTSP {linkLabel(diag.rtsp)} · Play {playbackLabel}
              {diag.reason ? ` · ${diag.reason}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Đóng (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Video */}
        <div className="relative aspect-video w-full bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn('h-full w-full object-contain', state === 'live' ? 'opacity-100' : 'opacity-0')}
          />
          <StreamOverlay diag={diag} />
        </div>

        {/* Meta footer */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-slate-800 px-4 py-3 text-xs sm:grid-cols-4">
          <Meta label="Mã" value={cam.code} mono />
          <Meta label="IP" value={cam.ip || '—'} mono />
          <Meta label="Vị trí" value={cam.location || '—'} />
          <Meta label="Playback" value={playbackLabel} />
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={cn('truncate text-slate-200', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

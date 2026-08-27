'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Maximize2, Minimize2, Loader2, VideoOff } from 'lucide-react';
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
      if (network === 'down') {
        setDiag({
          network: 'down',
          rtsp: 'down',
          playback: 'offline',
          reason: 'Mạng thiết bị không phản hồi — kiểm tra IP/cáp trước khi mở luồng',
        });
        return;
      }

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
          network: network === 'unknown' ? 'up' : network,
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
            network: prev.network === 'unknown' ? 'up' : prev.network,
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
        if (cancelled || !offer.sdp) return;

        const answer = await exchangeDeviceWebRtc(deviceId, { type: 'offer', sdp: offer.sdp });
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

export const DEMO_CAMERAS: CameraItem[] = [
  { code: 'CAM-MAIN', name: 'Camera Cổng Chính', location: 'Cổng chính', ip: '192.168.1.10', online: true },
  { code: 'demo_cam', name: 'Demo Camera', location: 'Demo', ip: '192.168.1.11', online: true },
];

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
  expanded = false,
}: {
  cameras: CameraItem[];
  layout?: number;
  selectedCode?: string | null;
  onSelect?: (code: string) => void;
  onExpand?: (cam: CameraItem) => void;
  /** True when a single camera fills the whole grid frame (1×1). */
  expanded?: boolean;
}) {
  const slots = Array.from({ length: layout }).map((_, i) => cameras[i] ?? null);
  const fillFrame = layout === 1;

  return (
    <div
      className={cn(
        'grid h-full w-full gap-0.5 p-0.5',
        fillFrame ? 'grid-cols-1 grid-rows-1' : cn('content-center', GRID_COLS[layout] ?? 'grid-cols-3'),
      )}
    >
      {slots.map((cam, i) =>
        cam ? (
          <CameraSlot
            key={cam.code}
            cam={cam}
            selected={cam.code === selectedCode}
            fillFrame={fillFrame}
            expanded={expanded && cam.code === selectedCode}
            onClick={() => onSelect?.(cam.code)}
            onExpand={onExpand ? () => onExpand(cam) : undefined}
          />
        ) : (
          <EmptySlot key={`empty-${i}`} fillFrame={fillFrame} />
        ),
      )}
    </div>
  );
}

function EmptySlot({ fillFrame }: { fillFrame?: boolean }) {
  return (
    <div
      className={cn(
        'relative flex w-full items-center justify-center overflow-hidden border border-slate-800 bg-[#0a0c10]',
        fillFrame ? 'h-full min-h-0' : 'aspect-video',
      )}
    >
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
  fillFrame,
  expanded,
  onClick,
  onExpand,
}: {
  cam: CameraItem;
  selected?: boolean;
  fillFrame?: boolean;
  expanded?: boolean;
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
        'group relative w-full cursor-pointer overflow-hidden border bg-slate-950 text-left outline-none',
        fillFrame ? 'h-full min-h-0' : 'aspect-video',
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

      {/* Expand = fill whole grid frame; again = restore multi-cam layout (not a modal). */}
      {onExpand && (
        <button
          type="button"
          title={expanded ? 'Thu về lưới nhiều camera' : 'Phóng toàn khung'}
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          className={cn(
            'absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 bg-black/40 text-white/80 backdrop-blur-md transition-opacity hover:bg-black/70 hover:text-white',
            expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
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

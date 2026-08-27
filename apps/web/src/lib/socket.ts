'use client';

import { io, Socket } from 'socket.io-client';
import { CheckinEvent, FireEmergencyEvent, SOCKET_EVENTS } from '@acv2/shared';

const CONFIGURED_WS_URL = (process.env.NEXT_PUBLIC_WS_URL || '').trim().replace(/\/$/, '');

function getWsUrl(): string {
  if (CONFIGURED_WS_URL) return CONFIGURED_WS_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://127.0.0.1:8010';
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${getWsUrl()}/events`, {
      transports: ['websocket', 'polling'],
      // Next normalizes a trailing slash with a 308 before the proxy runs;
      // Socket.IO follows the no-slash endpoint and the rewrite adds the API
      // server's required slash without a redirect.
      addTrailingSlash: false,
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function onCheckinEvent(callback: (event: CheckinEvent) => void) {
  const s = connectSocket();
  s.on(SOCKET_EVENTS.CHECKIN_EVENT, callback);
  return () => {
    s.off(SOCKET_EVENTS.CHECKIN_EVENT, callback);
  };
}

export function onFireEmergency(callback: (event: FireEmergencyEvent) => void) {
  const s = connectSocket();
  s.on(SOCKET_EVENTS.FIRE_EMERGENCY, callback);
  return () => {
    s.off(SOCKET_EVENTS.FIRE_EMERGENCY, callback);
  };
}

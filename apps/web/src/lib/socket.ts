'use client';

import { io, Socket } from 'socket.io-client';
import { CheckinEvent, FireEmergencyEvent, SOCKET_EVENTS } from '@acv2/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8080';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/events`, {
      transports: ['websocket', 'polling'],
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

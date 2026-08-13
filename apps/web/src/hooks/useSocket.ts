'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  connectSocket,
  onCheckinEvent,
  onFireEmergency,
} from '@/lib/socket';
import { CheckinEvent, FireEmergencyEvent } from '@acv2/shared';

/** Same-reader punch-cooldown noise — do not surface on dashboard. */
function isCooldownNoiseEvent(event: CheckinEvent): boolean {
  const msg = (event.warningMessage || '').toLowerCase();
  return msg.includes('quét trong vòng');
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<CheckinEvent | null>(null);
  const [fireEmergency, setFireEmergency] = useState<FireEmergencyEvent | null>(null);

  useEffect(() => {
    const socket = connectSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) setConnected(true);

    const unsubscribeCheckin = onCheckinEvent((event) => {
      if (isCooldownNoiseEvent(event)) return;
      setLastEvent(event);
    });

    const unsubscribeFire = onFireEmergency((event) => {
      setFireEmergency(event);
    });

    return () => {
      unsubscribeCheckin();
      unsubscribeFire();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const reconnect = useCallback(() => {
    const socket = connectSocket();
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();
  }, []);

  return {
    connected,
    lastEvent,
    setLastEvent,
    fireEmergency,
    setFireEmergency,
    reconnect,
  };
}

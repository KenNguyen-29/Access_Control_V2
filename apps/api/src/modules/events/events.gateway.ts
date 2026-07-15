import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { CheckinEvent, FireEmergencyEvent, SOCKET_EVENTS } from '@acv2/shared';

@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class EventsGateway {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  emitCheckinEvent(event: CheckinEvent) {
    this.server.emit(SOCKET_EVENTS.CHECKIN_EVENT, event);
  }

  emitDeviceStatus(deviceId: string, isOnline: boolean) {
    this.server.emit(SOCKET_EVENTS.DEVICE_STATUS, { deviceId, isOnline });
  }

  emitCameraStatus(cameraId: string, isOnline: boolean) {
    this.server.emit(SOCKET_EVENTS.CAMERA_STATUS, { cameraId, isOnline });
  }

  emitFireEmergency(event: FireEmergencyEvent) {
    this.server.emit(SOCKET_EVENTS.FIRE_EMERGENCY, event);
    this.logger.warn(`Emitted fire_emergency event=${event.eventId} people=${event.people.length}`);
  }
}

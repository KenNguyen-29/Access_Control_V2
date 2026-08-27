import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { CheckinEvent, FireEmergencyEvent, SOCKET_EVENTS } from '@acv2/shared';
import { RealtimeMetricsService } from './realtime-metrics.service';
import { adaptiveCorsOrigin } from '../../common/utils/network.util';

@WebSocketGateway({
  namespace: '/events',
  cors: {
    // Evaluate after ConfigModule has loaded .env. Empty means adaptive;
    // deployments can still provide a strict comma-separated allow-list.
    origin: adaptiveCorsOrigin,
    credentials: true,
  },
})
export class EventsGateway {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly metrics: RealtimeMetricsService) {}

  private connectedClients(): number {
    try {
      return this.server?.engine?.clientsCount ?? 0;
    } catch {
      return 0;
    }
  }

  emitCheckinEvent(event: CheckinEvent) {
    this.server.emit(SOCKET_EVENTS.CHECKIN_EVENT, event);
    this.metrics.markEmit(event.id);
    this.logger.log(
      `Emitted checkin_event id=${event.id} action=${event.action} clients=${this.connectedClients()}`,
    );
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

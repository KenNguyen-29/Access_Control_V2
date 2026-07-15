export interface AkuvoxWebhookPayload {
  eventId?: string;
  userId?: string;
  employeeCode?: string;
  deviceId?: string;
  deviceCode?: string;
  timestamp?: string;
  eventType?: string;
  captureImage?: string;
  imageBase64?: string;
  doorName?: string;
  [key: string]: unknown;
}

export interface AkuvoxWebhookJobData {
  payload: AkuvoxWebhookPayload;
  receivedAt: string;
  sourceIp?: string;
}

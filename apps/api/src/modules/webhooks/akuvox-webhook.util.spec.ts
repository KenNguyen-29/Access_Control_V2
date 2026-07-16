import { describe, expect, it } from 'vitest';
import { normalizeAkuvoxWebhookPayload, parseAkuvoxColonPairs } from './akuvox-webhook.util';

describe('parseAkuvoxColonPairs', () => {
  it('parses simple Akuvox action URL variables', () => {
    expect(parseAkuvoxColonPairs('ip=192.168.71.186:active_user=NV-0003:relay1status=1')).toEqual({
      ip: '192.168.71.186',
      active_user: 'NV-0003',
      relay1status: '1',
    });
  });
});

describe('normalizeAkuvoxWebhookPayload', () => {
  it('maps GET query from Akuvox Action URL', () => {
    const payload = normalizeAkuvoxWebhookPayload(
      undefined,
      {
        ip: '192.168.71.186',
        active_user: 'NV-0003',
        relay1status: '1',
      },
      '/api/webhooks/akuvox?ip=192.168.71.186&active_user=NV-0003&relay1status=1',
    );

    expect(payload.employeeCode).toBe('NV-0003');
    expect(payload.deviceIp).toBe('192.168.71.186');
  });

  it('keeps JSON POST payload fields', () => {
    const payload = normalizeAkuvoxWebhookPayload(
      {
        eventId: 'evt-1',
        employeeCode: 'NV-0003',
        deviceCode: 'DEV-A',
        timestamp: '2026-07-16T10:00:00+07:00',
      },
      {},
      '/api/webhooks/akuvox',
    );

    expect(payload.eventId).toBe('evt-1');
    expect(payload.employeeCode).toBe('NV-0003');
    expect(payload.deviceCode).toBe('DEV-A');
  });
});

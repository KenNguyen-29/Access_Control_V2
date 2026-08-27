import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeviceType } from '@prisma/client';
import { DeviceWebRtcService } from './device-webrtc.service';

describe('DeviceWebRtcService', () => {
  it('keeps the lazy go2rtc producer alive for the WebRTC consumer', async () => {
    const calls: string[] = [];
    const device = {
      id: 'camera-1',
      deviceType: DeviceType.CAMERA,
      rtspUrl: 'rtsp://192.168.1.4:554/mock-camera',
      rtspUsername: 'admin',
      rtspPassword: 'secret',
      isDeleted: false,
    };
    const service = new DeviceWebRtcService(
      { device: { findFirst: async () => device } } as never,
      {
        streamNameForDevice: (id: string) => `device_${id}`,
        upsertStream: async (name: string, source: string) => calls.push(`upsert:${name}:${source}`),
        removeStream: async (name: string) => calls.push(`remove:${name}`),
        probeStream: async (name: string) => calls.push(`probe:${name}`),
        exchangeWebRtc: async () => ({ type: 'answer', sdp: 'v=0' }),
      } as never,
    );

    const answer = await service.exchange('camera-1', { type: 'offer', sdp: 'v=0' });
    assert.deepEqual(answer, { type: 'answer', sdp: 'v=0' });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^upsert:device_camera-1:rtsp:\/\/admin:secret@192\.168\.1\.4:554\/mock-camera$/);
  });
});

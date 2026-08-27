import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { CameraConnectionSource, DeviceType } from '@prisma/client';
import { DevicesService } from './devices.service';

function makeService(go2rtc: Record<string, (...args: never[]) => Promise<unknown>> = {}) {
  return new DevicesService(
    {} as never,
    { get: () => undefined } as never,
    {
      upsertStream: async (...args: never[]) => go2rtc.upsertStream?.(...args),
      probeStream: async (...args: never[]) => go2rtc.probeStream?.(...args),
      removeStream: async (...args: never[]) => go2rtc.removeStream?.(...args),
    } as never,
    {} as never,
  );
}

describe('DevicesService ONVIF camera flow', () => {
  it('persists credential-free RTSP and ONVIF metadata', () => {
    const service = makeService() as unknown as {
      buildCameraData: (dto: unknown, ip: string) => Record<string, unknown>;
    };
    const result = service.buildCameraData(
      {
        deviceType: DeviceType.CAMERA,
        ipAddress: '192.168.2.127',
        rtspUrl: 'rtsp://admin:secret@192.168.2.127:554/live',
        connectionSource: CameraConnectionSource.ONVIF,
        onvifServiceUrl: 'http://192.168.2.127/onvif/device_service',
        onvifProfileToken: 'profile-main',
        onvifPort: 80,
        manufacturer: 'Tiandy',
        model: 'TC-H342N',
      },
      '192.168.2.127',
    );
    assert.equal(result.rtspUrl, 'rtsp://192.168.2.127:554/live');
    assert.equal(result.rtspUsername, 'admin');
    assert.equal(result.rtspPassword, 'secret');
    assert.equal(result.connectionSource, CameraConnectionSource.ONVIF);
    assert.equal(result.onvifProfileToken, 'profile-main');
  });

  it('rejects a stream or service URL that targets another host', () => {
    const service = makeService() as unknown as {
      buildCameraData: (dto: unknown, ip: string) => Record<string, unknown>;
    };
    assert.throws(
      () =>
        service.buildCameraData(
          {
            deviceType: DeviceType.CAMERA,
            ipAddress: '192.168.2.127',
            rtspUrl: 'rtsp://192.168.2.128:554/live',
            connectionSource: CameraConnectionSource.MANUAL,
          },
          '192.168.2.127',
        ),
      BadRequestException,
    );
  });

  it('stores ONVIF metadata and RTSP for Akuvox/DNAKE while panel credentials stay in panelConfig', () => {
    const service = makeService() as unknown as {
      buildPanelOnvifData: (dto: unknown, ip: string) => Record<string, unknown>;
    };
    const result = service.buildPanelOnvifData(
      {
        deviceType: DeviceType.AKUVOX,
        ipAddress: '192.168.2.127',
        rtspUrl: 'rtsp://192.168.2.127:554/stream/main',
        connectionSource: CameraConnectionSource.ONVIF,
        onvifServiceUrl: 'http://192.168.2.127/onvif/device_service',
        onvifProfileToken: 'profile-main',
        onvifPort: 80,
        manufacturer: 'Tiandy',
        model: 'TC-H342N',
      },
      '192.168.2.127',
    );
    assert.equal(result.connectionSource, CameraConnectionSource.ONVIF);
    assert.equal(result.rtspUrl, 'rtsp://192.168.2.127:554/stream/main');
    assert.equal(result.onvifProfileToken, 'profile-main');
  });

  it('always removes the temporary go2rtc source after a successful probe', async () => {
    const calls: string[] = [];
    const service = makeService({
      upsertStream: async (...args) => {
        calls.push(`upsert:${String(args[0])}:${String(args[1])}`);
      },
      probeStream: async (...args) => {
        calls.push(`probe:${String(args[0])}`);
      },
      removeStream: async (...args) => {
        calls.push(`remove:${String(args[0])}`);
      },
    });
    const result = await service.testOnvifStream({
      ipAddress: '192.168.2.127',
      rtspUrl: 'rtsp://192.168.2.127:554/live',
      username: 'admin',
      password: 'secret',
    });
    assert.equal(result.online, true);
    assert.equal(calls.length, 3);
    assert.match(calls[0], /^upsert:onvif_probe_/);
    assert.match(calls[0], /admin:secret@192\.168\.2\.127/);
    assert.match(calls[2], /^remove:onvif_probe_/);
  });
});

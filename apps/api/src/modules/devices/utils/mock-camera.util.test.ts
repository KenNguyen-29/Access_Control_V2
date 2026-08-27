import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveMockCameraSource } from './mock-camera.util';

describe('mock camera source resolver', () => {
  const options = {
    enabled: true,
    virtualIp: '192.168.1.4',
    source: 'http://127.0.0.1:19084/stream.mjpeg',
  };

  it('redirects only the configured virtual camera IP', () => {
    assert.equal(
      resolveMockCameraSource('rtsp://192.168.1.4:554/mock-camera', options),
      options.source,
    );
    assert.equal(
      resolveMockCameraSource('rtsp://192.168.1.5:554/mock-camera', options),
      'rtsp://192.168.1.5:554/mock-camera',
    );
  });

  it('is a no-op when mock mode is disabled', () => {
    const source = 'rtsp://192.168.1.4:554/mock-camera';
    assert.equal(resolveMockCameraSource(source, { ...options, enabled: false }), source);
  });

  it('adds optional credentials to a passthrough RTSP source', () => {
    assert.equal(
      resolveMockCameraSource('rtsp://192.168.1.4:554/stream', {
        ...options,
        source: 'rtsp://192.168.1.4:554/stream',
        username: 'admin',
        password: 'p@ss',
      }),
      'rtsp://admin:p%40ss@192.168.1.4:554/stream',
    );
  });
});

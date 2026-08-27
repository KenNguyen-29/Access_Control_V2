import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRtspUrlWithCredentials,
  canonicalizeRtspUrl,
  redactRtspUrl,
} from './rtsp-url.util';

describe('RTSP URL helpers', () => {
  it('canonicalizes and removes embedded credentials', () => {
    const result = canonicalizeRtspUrl('rtsp://u%40ser:p%40ss@192.168.2.127:8554/live?q=1');
    assert.equal(result.cleanUrl, 'rtsp://192.168.2.127:8554/live?q=1');
    assert.equal(result.hostname, '192.168.2.127');
    assert.equal(result.port, 8554);
  });

  it('supports rtsps and safely re-embeds credentials for go2rtc', () => {
    const url = buildRtspUrlWithCredentials('rtsps://192.168.2.127:554/live', 'u@ser', 'p@ss');
    assert.match(url, /^rtsps:\/\/u%40ser:p%40ss@192\.168\.2\.127:554\/live$/);
    assert.equal(redactRtspUrl(url), 'rtsps://***:***@192.168.2.127:554/live');
  });
});

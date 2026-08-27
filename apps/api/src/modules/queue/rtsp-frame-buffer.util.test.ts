import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractJpegFrames,
  selectClosestFrame,
  TimedJpegFrame,
} from './rtsp-frame-buffer.util';

const jpeg = (value: number) => Buffer.from([0xff, 0xd8, value, value + 1, 0xff, 0xd9]);

test('extractJpegFrames handles multiple and partial JPEGs', () => {
  const first = jpeg(1);
  const second = jpeg(3);
  const partial = Buffer.from([0xff, 0xd8, 9]);
  const parsed = extractJpegFrames(
    Buffer.concat([Buffer.from('noise'), first, second, partial]),
  );

  assert.deepEqual(parsed.frames, [first, second]);
  assert.deepEqual(parsed.remainder, partial);
});

test('selectClosestFrame ignores stale frames and selects nearest timestamp', () => {
  const now = 10_000;
  const frames: TimedJpegFrame[] = [
    { buffer: jpeg(1), capturedAt: 5_000 },
    { buffer: jpeg(2), capturedAt: 9_600 },
    { buffer: jpeg(3), capturedAt: 9_900 },
  ];

  const selected = selectClosestFrame(frames, 9_750, now, 2_000);
  assert.equal(selected?.capturedAt, 9_600);
});

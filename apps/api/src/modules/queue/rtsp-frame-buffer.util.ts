export type TimedJpegFrame = {
  buffer: Buffer;
  capturedAt: number;
};

export function extractJpegFrames(input: Buffer): {
  frames: Buffer[];
  remainder: Buffer;
} {
  const frames: Buffer[] = [];
  let cursor = input;

  while (cursor.length > 1) {
    const start = cursor.indexOf(Buffer.from([0xff, 0xd8]));
    if (start < 0) {
      return {
        frames,
        remainder: cursor[cursor.length - 1] === 0xff ? cursor.subarray(-1) : Buffer.alloc(0),
      };
    }

    const end = cursor.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
    if (end < 0) {
      return { frames, remainder: cursor.subarray(start) };
    }

    frames.push(Buffer.from(cursor.subarray(start, end + 2)));
    cursor = cursor.subarray(end + 2);
  }

  return { frames, remainder: cursor };
}

export function selectClosestFrame(
  frames: TimedJpegFrame[],
  targetAt: number,
  now: number,
  maxAgeMs: number,
): TimedJpegFrame | null {
  let selected: TimedJpegFrame | null = null;
  let selectedDelta = Number.POSITIVE_INFINITY;

  for (const frame of frames) {
    if (now - frame.capturedAt > maxAgeMs || frame.capturedAt > now + 1_000) continue;
    const delta = Math.abs(frame.capturedAt - targetAt);
    if (delta < selectedDelta) {
      selected = frame;
      selectedDelta = delta;
    }
  }

  return selected;
}

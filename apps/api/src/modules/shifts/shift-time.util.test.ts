import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeHhMm, shiftTimeIntervals } from '../shifts/shift-time.util';

describe('overnight shift times persistence helpers', () => {
  it('normalizes overnight times without rewriting to 08:00-17:00', () => {
    assert.equal(normalizeHhMm('22:00'), '22:00');
    assert.equal(normalizeHhMm('06:00'), '06:00');
    assert.equal(normalizeHhMm('08:00'), '08:00');
  });

  it('overnight intervals span midnight', () => {
    const intervals = shiftTimeIntervals('22:00', '06:00', true);
    assert.deepEqual(intervals, [
      [22 * 60, 1440],
      [0, 6 * 60],
    ]);
  });

  it('does not treat 08:00-17:00 as overnight unless flagged', () => {
    const day = shiftTimeIntervals('08:00', '17:00', false);
    assert.deepEqual(day, [[8 * 60, 17 * 60]]);
  });
});

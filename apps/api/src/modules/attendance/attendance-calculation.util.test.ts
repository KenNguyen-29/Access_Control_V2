import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttendanceStatus } from '@prisma/client';
import {
  computeEarlyLeaveAndOt,
  computeLateMinutes,
  computeMetricsFromTimes,
  computeWorkedMinutes,
  resolveWorkDateForPunch,
  shiftEndContinuousMinutes,
} from './attendance-calculation.util';

const dayShift = {
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  gracePeriodMinutes: 5,
  isOvernight: false,
};

const nightShift = {
  startTime: '22:00',
  endTime: '06:00',
  breakMinutes: 0,
  gracePeriodMinutes: 5,
  isOvernight: true,
};

/** Build an absolute instant for a Vietnam wall-clock time (independent of process TZ). */
function atVn(y: number, m: number, d: number, hh: number, mm: number): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+07:00`);
}

describe('attendance-calculation overnight', () => {
  it('shift end is workDate + endTime (+1 day when overnight)', () => {
    assert.equal(shiftEndContinuousMinutes(nightShift), 6 * 60 + 24 * 60);
    assert.equal(shiftEndContinuousMinutes(dayShift), 17 * 60);
  });

  it('early leave before midnight on overnight shift', () => {
    // Checkout 23:00 → 7h early vs 06:00 (420 min)
    const r = computeEarlyLeaveAndOt(nightShift, atVn(2026, 7, 23, 23, 0));
    assert.equal(r.earlyLeaveMinutes, 420);
    assert.equal(r.otMinutes, 0);
  });

  it('early leave after midnight on overnight shift', () => {
    const r = computeEarlyLeaveAndOt(nightShift, atVn(2026, 7, 24, 5, 0));
    assert.equal(r.earlyLeaveMinutes, 60);
    assert.equal(r.otMinutes, 0);
  });

  it('overtime after overnight end', () => {
    const r = computeEarlyLeaveAndOt(nightShift, atVn(2026, 7, 24, 7, 0));
    assert.equal(r.earlyLeaveMinutes, 0);
    assert.equal(r.otMinutes, 60);
  });

  it('late after midnight on overnight shift', () => {
    const late = computeLateMinutes(nightShift, atVn(2026, 7, 24, 0, 30));
    // 00:30 continuous = 24:30; start 22:00 + grace 5 → late 145
    assert.equal(late, 145);
  });

  it('work date for early-morning punch belongs to previous day', () => {
    const wd = resolveWorkDateForPunch(nightShift, atVn(2026, 7, 24, 5, 0));
    assert.equal(wd.toISOString().slice(0, 10), '2026-07-23');
  });

  it('QA sample: day shift 14:26–16:52 → early leave ~8 min, worked ~86 after break? (no break on short day)', () => {
    // Full day has 60 break; worked = 146 - 60 = 86 min ≈ 1h26
    const checkIn = atVn(2026, 7, 23, 14, 26);
    const checkOut = atVn(2026, 7, 23, 16, 52);
    const m = computeMetricsFromTimes(
      dayShift,
      checkIn,
      checkOut,
      resolveWorkDateForPunch(dayShift, checkIn),
    );
    assert.equal(m.earlyLeaveMinutes, 8); // 17:00 - 16:52
    assert.equal(m.workedMinutes, 86); // 2h26 - 60 break
    assert.equal(m.status, AttendanceStatus.LATE); // late wins over early leave
  });

  it('day shift on-time worked minutes exclude break', () => {
    const checkIn = atVn(2026, 7, 23, 8, 0);
    const checkOut = atVn(2026, 7, 23, 17, 0);
    const worked = computeWorkedMinutes(
      resolveWorkDateForPunch(dayShift, checkIn),
      checkIn,
      checkOut,
      60,
    );
    assert.equal(worked, 480); // 9h - 1h break
  });

  it('early leave grace reduces earlyLeaveMinutes', () => {
    const r = computeEarlyLeaveAndOt(dayShift, atVn(2026, 7, 23, 16, 57), {
      earlyLeaveGraceMinutes: 5,
    });
    assert.equal(r.earlyLeaveMinutes, 0);
    assert.equal(r.otMinutes, 0);
  });

  it('otAfterMinutes delays OT start', () => {
    const r = computeEarlyLeaveAndOt(dayShift, atVn(2026, 7, 23, 17, 20), {
      otAfterMinutes: 30,
    });
    assert.equal(r.earlyLeaveMinutes, 0);
    assert.equal(r.otMinutes, 0);
  });

  it('late check-in + early checkout stays LATE (not EARLY_LEAVE / on-time)', () => {
    const checkIn = atVn(2026, 8, 13, 10, 35);
    const checkOut = atVn(2026, 8, 13, 10, 57);
    const m = computeMetricsFromTimes(
      dayShift,
      checkIn,
      checkOut,
      resolveWorkDateForPunch(dayShift, checkIn),
    );
    assert.ok(m.lateMinutes >= 150);
    assert.ok(m.earlyLeaveMinutes > 0);
    assert.equal(m.status, AttendanceStatus.LATE);
  });

  it('09:46 VN vs 08:00 shift is late even when stored as UTC instant', () => {
    // 09:46 Asia/Ho_Chi_Minh = 02:46Z — Docker UTC getHours() would wrongly yield 0 late.
    const checkIn = new Date('2026-08-03T02:46:00.000Z');
    assert.equal(computeLateMinutes(dayShift, checkIn), 101);
    const m = computeMetricsFromTimes(dayShift, checkIn, null, resolveWorkDateForPunch(dayShift, checkIn));
    assert.equal(m.status, AttendanceStatus.LATE);
    assert.equal(m.lateMinutes, 101);
  });
});

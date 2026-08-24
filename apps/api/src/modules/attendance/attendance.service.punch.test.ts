import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttendanceStatus } from '@prisma/client';
import { AttendanceCalculationService } from './attendance-calculation.service';
import { AttendanceService } from './attendance.service';

const defaultShift = {
  id: 'default-shift',
  name: 'Ca mặc định',
  code: 'DEFAULT',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  gracePeriodMinutes: 5,
  salaryCoefficient: 1,
  isOvernight: false,
  isDeleted: false,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const assignedShift = {
  ...defaultShift,
  id: 'assigned-shift',
  name: 'Ca hành chính',
  code: 'HC',
  isDefault: false,
};

function atVn(y: number, m: number, d: number, hh: number, mm: number): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+07:00`);
}

function makeService(opts: {
  assignedWorkShift: typeof assignedShift | null;
  upsertCalls: unknown[];
}) {
  const prisma = {
    employeeShift: {
      findFirst: async () =>
        opts.assignedWorkShift
          ? { workShift: opts.assignedWorkShift }
          : null,
    },
    systemSetting: {
      findUnique: async () => ({ key: 'default_work_shift_id', value: defaultShift.id }),
    },
    workShift: {
      findFirst: async (args: { where?: { id?: string; isDefault?: boolean } }) => {
        if (args.where?.id === defaultShift.id || args.where?.isDefault) return defaultShift;
        return null;
      },
    },
    attendanceRecord: {
      findUnique: async () => null,
      upsert: async (args: unknown) => {
        opts.upsertCalls.push(args);
        return {
          id: 'rec-1',
          userId: 'user-1',
          workShiftId: assignedShift.id,
          date: new Date(),
          checkInAt: atVn(2026, 8, 3, 8, 0),
          checkOutAt: null,
          status: AttendanceStatus.ON_TIME,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          otMinutes: 0,
          note: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      update: async () => {
        throw new Error('update should not be called in these tests');
      },
    },
  };

  const settings = {
    getNumber: async (_key: string, fallback: number) => fallback,
  };

  const calc = new AttendanceCalculationService(settings as never);
  const config = { get: (_key: string, fallback?: string) => fallback ?? '5' };
  const storage = {
    getAssetUrl: async () => undefined,
    getSignedUrl: async () => undefined,
  };

  return new AttendanceService(
    prisma as never,
    config as never,
    calc,
    settings as never,
    storage as never,
  );
}

describe('AttendanceService.processPunch requires assigned shift', () => {
  it('ignores punch when employee has no EmployeeShift even if default shift exists', async () => {
    const upsertCalls: unknown[] = [];
    const service = makeService({ assignedWorkShift: null, upsertCalls });

    const result = await service.processPunch('user-1', atVn(2026, 8, 3, 8, 10));

    assert.equal(result.outcome, 'IGNORED');
    assert.equal(result.reason, 'NO_SHIFT');
    assert.equal(result.record, null);
    assert.equal(upsertCalls.length, 0);

    // Default fallback still available for non-punch resolve
    const fallback = await service.resolveShiftForUser('user-1', atVn(2026, 8, 3, 8, 10));
    assert.equal(fallback?.id, defaultShift.id);
  });

  it('creates check-in when employee has an assigned EmployeeShift', async () => {
    const upsertCalls: unknown[] = [];
    const service = makeService({ assignedWorkShift: assignedShift, upsertCalls });

    const result = await service.processPunch('user-1', atVn(2026, 8, 3, 8, 10));

    assert.equal(result.outcome, 'CHECK_IN');
    assert.ok(result.record);
    assert.equal(upsertCalls.length, 1);
  });
});

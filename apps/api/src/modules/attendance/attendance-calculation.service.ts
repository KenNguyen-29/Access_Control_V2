import { Injectable } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SETTING_KEY } from '../system-settings/system-setting-keys';
import {
  computeAttendanceStatus,
  computeEarlyArrivalMinutes,
  computeEarlyLeaveAndOt,
  computeLateMinutes,
  computeMetricsFromTimes,
  computeWorkedMinutes,
  computeWorkingDayCredit,
  resolveWorkDateForPunch,
  type AttendanceMetrics,
  type EarlyLeaveOtOptions,
  type ShiftLike,
} from './attendance-calculation.util';

@Injectable()
export class AttendanceCalculationService {
  constructor(private readonly settings: SystemSettingsService) {}

  async getPolicyOptions(): Promise<
    EarlyLeaveOtOptions & { lateGraceFloor: number; otMultiplier: number }
  > {
    const [lateGraceFloor, earlyLeaveGraceMinutes, otAfterMinutes, otMultiplier] =
      await Promise.all([
        this.settings.getNumber(SETTING_KEY.ATTENDANCE_LATE_GRACE_MINUTES, 5),
        this.settings.getNumber(SETTING_KEY.ATTENDANCE_EARLY_LEAVE_GRACE_MINUTES, 5),
        this.settings.getNumber(SETTING_KEY.OT_AFTER_MINUTES, 0),
        this.settings.getNumber(SETTING_KEY.OT_MULTIPLIER, 1.25),
      ]);
    return { lateGraceFloor, earlyLeaveGraceMinutes, otAfterMinutes, otMultiplier };
  }

  /** Apply system late-grace floor; shift value wins when higher. */
  applyLateGraceFloor(shift: ShiftLike, lateGraceFloor: number): ShiftLike {
    const shiftGrace = Math.max(0, shift.gracePeriodMinutes ?? 0);
    return {
      ...shift,
      gracePeriodMinutes: Math.max(lateGraceFloor, shiftGrace),
    };
  }

  resolveWorkDateForPunch(shift: ShiftLike | null, eventTime: Date): Date {
    return resolveWorkDateForPunch(shift, eventTime);
  }

  computeLateMinutes(shift: ShiftLike, checkInAt: Date): number {
    return computeLateMinutes(shift, checkInAt);
  }

  computeEarlyArrivalMinutes(checkInAt: Date | null, shift: ShiftLike | null | undefined): number {
    return computeEarlyArrivalMinutes(checkInAt, shift);
  }

  computeEarlyLeaveAndOt(
    shift: ShiftLike,
    checkOutAt: Date,
    options?: EarlyLeaveOtOptions,
  ) {
    return computeEarlyLeaveAndOt(shift, checkOutAt, options);
  }

  computeWorkedMinutes(
    workDate: Date,
    checkInAt: Date | null,
    checkOutAt: Date | null,
    breakMinutes: number,
    asOf?: Date,
  ): number {
    return computeWorkedMinutes(workDate, checkInAt, checkOutAt, breakMinutes, asOf);
  }

  computeStatus(params: {
    lateMinutes: number;
    earlyLeaveMinutes: number;
    otMinutes: number;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    explicit?: AttendanceStatus | null;
  }): AttendanceStatus {
    return computeAttendanceStatus(params);
  }

  computeWorkingDayCredit(
    params: Parameters<typeof computeWorkingDayCredit>[0],
  ): ReturnType<typeof computeWorkingDayCredit> {
    return computeWorkingDayCredit(params);
  }

  computeMetricsFromTimes(
    shift: ShiftLike | null,
    checkInAt: Date | null,
    checkOutAt: Date | null,
    workDate?: Date,
    asOf?: Date,
    options?: EarlyLeaveOtOptions,
  ): AttendanceMetrics {
    return computeMetricsFromTimes(shift, checkInAt, checkOutAt, workDate, asOf, options);
  }

  async computeMetricsWithPolicy(
    shift: ShiftLike | null,
    checkInAt: Date | null,
    checkOutAt: Date | null,
    workDate?: Date,
    asOf?: Date,
  ): Promise<AttendanceMetrics> {
    const policy = await this.getPolicyOptions();
    const effective = shift ? this.applyLateGraceFloor(shift, policy.lateGraceFloor) : null;
    return this.computeMetricsFromTimes(effective, checkInAt, checkOutAt, workDate, asOf, {
      earlyLeaveGraceMinutes: policy.earlyLeaveGraceMinutes,
      otAfterMinutes: policy.otAfterMinutes,
    });
  }
}

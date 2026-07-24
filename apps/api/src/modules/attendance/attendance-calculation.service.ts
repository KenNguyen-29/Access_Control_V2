import { Injectable } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
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
  type ShiftLike,
} from './attendance-calculation.util';

@Injectable()
export class AttendanceCalculationService {
  resolveWorkDateForPunch(shift: ShiftLike | null, eventTime: Date): Date {
    return resolveWorkDateForPunch(shift, eventTime);
  }

  computeLateMinutes(shift: ShiftLike, checkInAt: Date): number {
    return computeLateMinutes(shift, checkInAt);
  }

  computeEarlyArrivalMinutes(checkInAt: Date | null, shift: ShiftLike | null | undefined): number {
    return computeEarlyArrivalMinutes(checkInAt, shift);
  }

  computeEarlyLeaveAndOt(shift: ShiftLike, checkOutAt: Date) {
    return computeEarlyLeaveAndOt(shift, checkOutAt);
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
  ): AttendanceMetrics {
    return computeMetricsFromTimes(shift, checkInAt, checkOutAt, workDate, asOf);
  }
}

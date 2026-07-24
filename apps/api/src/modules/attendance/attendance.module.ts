import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceCalculationService } from './attendance-calculation.service';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceCalculationService],
  exports: [AttendanceService, AttendanceCalculationService],
})
export class AttendanceModule {}

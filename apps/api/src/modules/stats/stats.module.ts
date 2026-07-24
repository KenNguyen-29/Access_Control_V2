import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [AttendanceModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}

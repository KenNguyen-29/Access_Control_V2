import { Module } from '@nestjs/common';
import { RbacModule } from '../../common/rbac/rbac.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [AttendanceModule, RbacModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}

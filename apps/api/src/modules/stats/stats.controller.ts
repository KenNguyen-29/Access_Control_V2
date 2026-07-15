import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../../common/utils/response.util';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get('overview')
  async overview() {
    return successResponse(await this.service.overview());
  }

  @Get('attendance-summary')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  async attendanceSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return successResponse(await this.service.attendanceSummary({ from, to, departmentId }));
  }

  @Get('weekly-timesheet')
  @ApiQuery({ name: 'weekStart', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  async weeklyTimesheet(
    @Query('weekStart') weekStart?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return successResponse(await this.service.weeklyTimesheet({ weekStart, departmentId }));
  }
}

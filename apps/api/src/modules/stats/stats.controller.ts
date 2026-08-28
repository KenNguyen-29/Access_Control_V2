import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProjectScopeService } from '../../common/services/project-scope.service';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  AttendanceSummaryQueryDto,
  WeeklyTimesheetQueryDto,
} from './dto/stats-pagination.dto';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(
    private readonly service: StatsService,
    private readonly projectScope: ProjectScopeService,
  ) {}

  private async scopedProjectId(user: JwtPayload, projectId?: string) {
    const scope = await this.projectScope.scopeFromLiveUser(user);
    const filter = this.projectScope.mergeProjectFilter(scope, projectId);
    const pid = filter.projectId;
    return typeof pid === 'string' ? pid : undefined;
  }

  private async scopedProjectIds(user: JwtPayload): Promise<string[] | undefined> {
    const scope = await this.projectScope.scopeFromLiveUser(user);
    return this.projectScope.mergeProjectIdList(scope);
  }

  @Get('overview')
  async overview(@CurrentUser() user?: JwtPayload) {
    const projectIds = await this.scopedProjectIds(user!);
    return successResponse(await this.service.overview(projectIds));
  }

  @Get('home-dashboard')
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  async homeDashboard(
    @CurrentUser() user?: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const projectIds = await this.scopedProjectIds(user!);
    return successResponse(await this.service.homeDashboard(projectIds, { from, to }));
  }

  @Get('attendance-summary')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'contractorId', required: false })
  @ApiQuery({ name: 'projectId', required: false })
  async attendanceSummary(@Query() query: AttendanceSummaryQueryDto) {
    return successResponse(
      await this.service.attendanceSummary({
        from: query.from,
        to: query.to,
        departmentId: query.departmentId,
        contractorId: query.contractorId,
        projectId: query.projectId,
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        sort: query.sort,
        hasLate: query.hasLate,
        hasEarlyArrival: query.hasEarlyArrival,
        hasOt: query.hasOt,
      }),
    );
  }

  @Get('weekly-timesheet')
  async weeklyTimesheet(@Query() query: WeeklyTimesheetQueryDto) {
    return successResponse(
      await this.service.weeklyTimesheet({
        weekStart: query.weekStart,
        from: query.from,
        to: query.to,
        departmentId: query.departmentId,
        contractorId: query.contractorId,
        projectId: query.projectId,
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        sort: query.sort,
        status: query.status,
        hasLate: query.hasLate,
        hasEarlyArrival: query.hasEarlyArrival,
        hasOt: query.hasOt,
      }),
    );
  }

  @Get('analytics')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'contractorId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  async analytics(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('projectId') projectId?: string,
    @Query('contractorId') contractorId?: string,
    @Query('userId') userId?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(
      await this.service.analytics({
        from,
        to,
        contractorId,
        userId,
        projectId: await this.scopedProjectId(user!, projectId),
        projectIds: await this.scopedProjectIds(user!),
      }),
    );
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProjectScopeService } from '../../common/services/project-scope.service';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../auth/jwt.strategy';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(
    private readonly service: StatsService,
    private readonly projectScope: ProjectScopeService,
  ) {}

  private scopedProjectId(user: JwtPayload, projectId?: string) {
    const scope = this.projectScope.scopeFromUser(user);
    const filter = this.projectScope.mergeProjectFilter(scope, projectId);
    const pid = filter.projectId;
    return typeof pid === 'string' ? pid : undefined;
  }

  private scopedProjectIds(user: JwtPayload): string[] | undefined {
    const scope = this.projectScope.scopeFromUser(user);
    return this.projectScope.mergeProjectIdList(scope);
  }

  @Get('overview')
  async overview() {
    return successResponse(await this.service.overview());
  }

  @Get('home-dashboard')
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  async homeDashboard(
    @CurrentUser() user?: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const projectIds = this.scopedProjectIds(user!);
    return successResponse(await this.service.homeDashboard(projectIds, { from, to }));
  }

  @Get('attendance-summary')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'contractorId', required: false })
  @ApiQuery({ name: 'projectId', required: false })
  async attendanceSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('departmentId') departmentId?: string,
    @Query('contractorId') contractorId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return successResponse(
      await this.service.attendanceSummary({
        from,
        to,
        departmentId,
        contractorId,
        projectId,
      }),
    );
  }

  @Get('weekly-timesheet')
  @ApiQuery({ name: 'weekStart', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'contractorId', required: false })
  @ApiQuery({ name: 'projectId', required: false })
  async weeklyTimesheet(
    @Query('weekStart') weekStart?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('departmentId') departmentId?: string,
    @Query('contractorId') contractorId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return successResponse(
      await this.service.weeklyTimesheet({
        weekStart,
        from,
        to,
        departmentId,
        contractorId,
        projectId,
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
        projectId: this.scopedProjectId(user!, projectId),
        projectIds: this.scopedProjectIds(user!),
      }),
    );
  }
}

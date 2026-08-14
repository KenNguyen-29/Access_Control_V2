import { Controller, Get, Post, Query, Res } from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { ProjectScopeService } from '../../common/services/project-scope.service';

import { successResponse } from '../../common/utils/response.util';

import type { JwtPayload } from '../auth/jwt.strategy';

import { ContractorReportsService } from './contractor-reports.service';



@ApiTags('contractor-reports')

@ApiBearerAuth()

@Controller('contractor-reports')

export class ContractorReportsController {

  constructor(

    private readonly service: ContractorReportsService,

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



  @Get('headcount')

  async headcount(@Query('date') date?: string, @CurrentUser() user?: JwtPayload) {

    return successResponse(

      await this.service.headcountByContractor({

        date,

        projectIds: this.scopedProjectIds(user!),

      }),

    );

  }



  @Get('personnel')

  async personnel(

    @Query('from') from?: string,

    @Query('to') to?: string,

    @Query('contractorId') contractorId?: string,

    @Query('projectId') projectId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    return successResponse(

      await this.service.personnelDetail({

        from,

        to,

        contractorId,

        projectId: this.scopedProjectId(user!, projectId),

        projectIds: this.scopedProjectIds(user!),

      }),

    );

  }



  @Get('access-logs')

  async accessLogs(

    @Query('from') from?: string,

    @Query('to') to?: string,

    @Query('contractorId') contractorId?: string,

    @Query('projectId') projectId?: string,

    @Query('userId') userId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    return successResponse(

      await this.service.accessLogReport({

        from,

        to,

        contractorId,

        projectId: this.scopedProjectId(user!, projectId),

        projectIds: this.scopedProjectIds(user!),

        userId,

      }),

    );

  }



  @Get('shift-personnel')

  async shiftPersonnel(

    @Query('contractorId') contractorId?: string,

    @Query('workShiftId') workShiftId?: string,

    @Query('projectId') projectId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    return successResponse(

      await this.service.shiftPersonnel({

        contractorId,

        workShiftId,

        projectId: this.scopedProjectId(user!, projectId),

        projectIds: this.scopedProjectIds(user!),

      }),

    );

  }



  @Get('export/personnel')

  async exportPersonnel(

    @Res() res: Response,

    @Query('from') from?: string,

    @Query('to') to?: string,

    @Query('contractorId') contractorId?: string,

    @Query('projectId') projectId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    const buf = await this.service.exportPersonnelExcel({

      from,

      to,

      contractorId,

      projectId: this.scopedProjectId(user!, projectId),

      projectIds: this.scopedProjectIds(user!),

    });

    res.setHeader(

      'Content-Type',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    );

    res.setHeader('Content-Disposition', 'attachment; filename="contractor-personnel.xlsx"');

    res.send(buf);

  }



  @Get('export/access-logs')

  async exportAccessLogs(

    @Res() res: Response,

    @Query('from') from?: string,

    @Query('to') to?: string,

    @Query('contractorId') contractorId?: string,

    @Query('projectId') projectId?: string,

    @Query('userId') userId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    const buf = await this.service.exportAccessLogsExcel({

      from,

      to,

      contractorId,

      projectId: this.scopedProjectId(user!, projectId),

      projectIds: this.scopedProjectIds(user!),

      userId,

    });

    res.setHeader(

      'Content-Type',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    );

    res.setHeader('Content-Disposition', 'attachment; filename="contractor-access-logs.xlsx"');

    res.send(buf);

  }



  @Get('export/shift-personnel')

  async exportShiftPersonnel(

    @Res() res: Response,

    @Query('contractorId') contractorId?: string,

    @Query('workShiftId') workShiftId?: string,

    @Query('projectId') projectId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    const buf = await this.service.exportShiftPersonnelExcel({

      contractorId,

      workShiftId,

      projectId: this.scopedProjectId(user!, projectId),

      projectIds: this.scopedProjectIds(user!),

    });

    res.setHeader(

      'Content-Type',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    );

    res.setHeader('Content-Disposition', 'attachment; filename="shift-personnel.xlsx"');

    res.send(buf);

  }



  @Get('export/headcount')

  async exportHeadcount(

    @Res() res: Response,

    @Query('date') date?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    const buf = await this.service.exportHeadcountExcel({

      date,

      projectIds: this.scopedProjectIds(user!),

    });

    res.setHeader(

      'Content-Type',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    );

    res.setHeader('Content-Disposition', 'attachment; filename="contractor-headcount.xlsx"');

    res.send(buf);

  }



  @Get('monthly')

  async monthly(

    @Query('month') month?: string,

    @Query('contractorId') contractorId?: string,

    @Query('projectId') projectId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    return successResponse(

      await this.service.monthlyTimesheet({

        month,

        contractorId,

        projectId: this.scopedProjectId(user!, projectId),

        projectIds: this.scopedProjectIds(user!),

      }),

    );

  }



  @Get('export/monthly')

  async exportMonthly(

    @Res() res: Response,

    @Query('month') month?: string,

    @Query('contractorId') contractorId?: string,

    @Query('projectId') projectId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    const buf = await this.service.exportMonthlyExcel({

      month,

      contractorId,

      projectId: this.scopedProjectId(user!, projectId),

      projectIds: this.scopedProjectIds(user!),

    });

    res.setHeader(

      'Content-Type',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    );

    res.setHeader('Content-Disposition', 'attachment; filename="contractor-monthly.xlsx"');

    res.send(buf);

  }



  @Get('export/monthly-detail')

  async exportMonthlyDetail(

    @Res() res: Response,

    @Query('month') month?: string,

    @Query('contractorId') contractorId?: string,

    @Query('projectId') projectId?: string,

    @CurrentUser() user?: JwtPayload,

  ) {

    const buf = await this.service.exportMonthlyDetailExcel({

      month,

      contractorId,

      projectId: this.scopedProjectId(user!, projectId),

      projectIds: this.scopedProjectIds(user!),

    });

    res.setHeader(

      'Content-Type',

      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    );

    res.setHeader('Content-Disposition', 'attachment; filename="contractor-monthly-detail.xlsx"');

    res.send(buf);

  }



  @Post('snapshot')

  async snapshot(@Query('date') date?: string, @Query('push') push?: string) {

    const doPush = push !== 'false' && push !== '0';

    return successResponse(await this.service.snapshotAndPush(date, doPush), 'Đã tạo snapshot');

  }



  @Get('snapshots')

  async snapshots(@Query('limit') limit?: string) {

    const n = limit ? Number(limit) : 30;

    return successResponse(await this.service.listSnapshots(Number.isFinite(n) ? n : 30));

  }

}



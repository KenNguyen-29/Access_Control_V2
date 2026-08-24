import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProjectScopeService } from '../../common/services/project-scope.service';
import { paginatedResponse, successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../auth/jwt.strategy';
import { formatLocalDate, sendXlsx } from './attendance-excel.util';
import { AttendanceRecordsQueryDto } from './dto/attendance-records-query.dto';
import { AccessLogsQueryDto } from './dto/access-logs-query.dto';
import { AttendanceService } from './attendance.service';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly projectScope: ProjectScopeService,
  ) {}

  private async scopedProjectIds(user?: JwtPayload) {
    const scope = await this.projectScope.scopeFromLiveUser(user);
    return this.projectScope.mergeProjectIdList(scope);
  }

  @Get('records')
  async findRecords(
    @Query() query: AttendanceRecordsQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const result = await this.service.findRecords({
      ...query,
      projectIds: await this.scopedProjectIds(user),
    });
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get('access-logs')
  async findAccessLogs(
    @Query() query: AccessLogsQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const result = await this.service.findAccessLogs({
      ...query,
      projectIds: await this.scopedProjectIds(user),
    });
    if (Array.isArray(result)) {
      return successResponse(result);
    }
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get('export')
  async export(
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.service.buildExportBuffer({ userId, from, to });
    sendXlsx(res, buffer, `attendance-${formatLocalDate(new Date())}.xlsx`);
  }

  @Get('export-template')
  async exportTemplate(@Res() res: Response) {
    const buffer = await this.service.buildTemplateBuffer();
    sendXlsx(res, buffer, 'attendance-template.xlsx');
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file Excel (.xlsx)');
    }
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new BadRequestException('Chỉ hỗ trợ file Excel (.xlsx)');
    }
    const result = await this.service.importFromExcelBuffer(file.buffer);
    return successResponse(result);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../../common/utils/response.util';
import { ShiftsService } from './shifts.service';
import { CreateWorkShiftDto } from './dto/create-work-shift.dto';
import { CreateEmployeeShiftDto } from './dto/create-employee-shift.dto';
import { BulkAssignEmployeeShiftDto } from './dto/bulk-assign-employee-shift.dto';
import { UpdateWorkShiftDto } from './dto/update-work-shift.dto';
import { UpdateEmployeeShiftDto } from './dto/update-employee-shift.dto';
import { SetDefaultShiftDto } from './dto/set-default-shift.dto';
import { EndEmployeeShiftDto } from './dto/end-employee-shift.dto';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  @Get('work-shifts')
  async findWorkShifts() {
    return successResponse(await this.service.findWorkShifts());
  }

  @Post('work-shifts')
  async createWorkShift(@Body() dto: CreateWorkShiftDto) {
    return successResponse(await this.service.createWorkShift(dto), 'Work shift created');
  }

  @Patch('work-shifts/:id')
  async updateWorkShift(@Param('id') id: string, @Body() dto: UpdateWorkShiftDto) {
    return successResponse(await this.service.updateWorkShift(id, dto), 'Work shift updated');
  }

  @Delete('work-shifts/:id')
  async removeWorkShift(@Param('id') id: string) {
    await this.service.removeWorkShift(id);
    return successResponse(null, 'Work shift deleted');
  }

  @Get('default')
  async getDefault() {
    return successResponse(await this.service.getDefaultShift());
  }

  @Post('default')
  async setDefault(@Body() dto: SetDefaultShiftDto) {
    return successResponse(await this.service.setDefaultShift(dto.workShiftId), 'Default shift set');
  }

  @Get('employee-shifts')
  async findEmployeeShifts(@Query('userId') userId?: string) {
    return successResponse(await this.service.findEmployeeShifts(userId));
  }

  @Post('employee-shifts')
  async createEmployeeShift(@Body() dto: CreateEmployeeShiftDto) {
    return successResponse(await this.service.createEmployeeShift(dto), 'Employee shift assigned');
  }

  @Post('employee-shifts/bulk')
  async bulkAssignEmployeeShift(@Body() dto: BulkAssignEmployeeShiftDto) {
    return successResponse(await this.service.bulkAssignEmployeeShift(dto), 'Đã gán ca hàng loạt');
  }

  @Patch('employee-shifts/:id')
  async updateEmployeeShift(@Param('id') id: string, @Body() dto: UpdateEmployeeShiftDto) {
    return successResponse(await this.service.updateEmployeeShift(id, dto), 'Employee shift updated');
  }

  @Post('employee-shifts/:id/end')
  async endEmployeeShift(@Param('id') id: string, @Body() body: EndEmployeeShiftDto = {}) {
    return successResponse(
      await this.service.endEmployeeShift(id, body?.endDate),
      'Employee shift ended',
    );
  }

  @Delete('employee-shifts/:id')
  async removeEmployeeShift(@Param('id') id: string) {
    await this.service.removeEmployeeShift(id);
    return successResponse(null, 'Employee shift removed');
  }
}

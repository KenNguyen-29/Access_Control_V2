import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../../common/utils/response.util';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  async findAll() {
    const items = await this.service.findAll();
    return successResponse(items);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return successResponse(await this.service.findOne(id));
  }

  @Post()
  async create(@Body() dto: CreateDepartmentDto) {
    return successResponse(await this.service.create(dto), 'Department created');
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return successResponse(await this.service.update(id, dto), 'Department updated');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return successResponse(null, 'Department deleted');
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ProjectScopeService } from '../../common/services/project-scope.service';
import { paginatedResponse, successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ContractorsService } from './contractors.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { TransferContractorProjectDto } from './dto/transfer-contractor-project.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';
import { ContractorsQueryDto } from './dto/contractors-query.dto';

@ApiTags('contractors')
@ApiBearerAuth()
@Controller('contractors')
export class ContractorsController {
  constructor(
    private readonly service: ContractorsService,
    private readonly projectScope: ProjectScopeService,
  ) {}

  @Get()
  async findAll(@Query() query: ContractorsQueryDto, @CurrentUser() user?: JwtPayload) {
    const scope = await this.projectScope.scopeFromLiveUser(user);
    const result = await this.service.findAll(query, scope);
    if (Array.isArray(result)) {
      return successResponse(result);
    }
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    const scope = await this.projectScope.scopeFromLiveUser(user);
    return successResponse(await this.service.findOne(id, scope));
  }

  @Post()
  async create(@Body() dto: CreateContractorDto) {
    return successResponse(await this.service.create(dto), 'Đã tạo nhà thầu');
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateContractorDto) {
    return successResponse(await this.service.update(id, dto), 'Đã cập nhật nhà thầu');
  }

  @Post(':id/transfer-project')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async transferProject(
    @Param('id') id: string,
    @Body() dto: TransferContractorProjectDto,
  ) {
    const result = await this.service.transferProject(id, dto);
    return successResponse(
      result,
      result.usersMoved > 0
        ? `Đã chuyển nhà thầu sang dự án mới (${result.usersMoved} nhân viên)`
        : 'Đã chuyển nhà thầu sang dự án mới',
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return successResponse(null, 'Đã xóa nhà thầu');
  }
}

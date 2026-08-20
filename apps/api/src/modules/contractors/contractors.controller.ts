import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { successResponse } from '../../common/utils/response.util';
import { ContractorsService } from './contractors.service';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { TransferContractorProjectDto } from './dto/transfer-contractor-project.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';

@ApiTags('contractors')
@ApiBearerAuth()
@Controller('contractors')
export class ContractorsController {
  constructor(private readonly service: ContractorsService) {}

  @Get()
  async findAll() {
    return successResponse(await this.service.findAll());
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return successResponse(await this.service.findOne(id));
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

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ProjectScopeService } from '../../common/services/project-scope.service';
import { paginatedResponse, successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../auth/jwt.strategy';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { TransferUserProjectDto } from './dto/transfer-user-project.dto';
import { UsersIdsQueryDto, UsersQueryDto } from './dto/users-query.dto';
import { sendXlsx } from './users-excel.util';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly projectScope: ProjectScopeService,
  ) {}

  @Get()
  async findAll(@Query() query: UsersQueryDto, @CurrentUser() user: JwtPayload) {
    const scope = await this.projectScope.scopeFromLiveUser(user);
    const scopeFilter = this.projectScope.mergeProjectFilter(scope, query.projectId);
    const result = await this.usersService.findAll(query, scopeFilter);
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get('ids')
  async findIds(@Query() query: UsersIdsQueryDto, @CurrentUser() user: JwtPayload) {
    const scope = await this.projectScope.scopeFromLiveUser(user);
    const scopeFilter = this.projectScope.mergeProjectFilter(scope, query.projectId);
    const result = await this.usersService.findIds(query, scopeFilter);
    return successResponse(result);
  }

  @Get('import-template')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  async importTemplate(@Res() res: Response) {
    const buffer = await this.usersService.buildImportTemplateBuffer();
    sendXlsx(res, buffer, 'users-import-template.xlsx');
  }

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        excel: { type: 'string', format: 'binary', description: 'File Excel (.xlsx)' },
        photos: { type: 'string', format: 'binary', description: 'ZIP chứa ảnh JPG/PNG' },
      },
      required: ['excel', 'photos'],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'excel', maxCount: 1 },
        { name: 'photos', maxCount: 1 },
      ],
      { limits: { fileSize: 80 * 1024 * 1024 } },
    ),
  )
  async import(
    @UploadedFiles()
    files?: { excel?: Express.Multer.File[]; photos?: Express.Multer.File[] },
  ) {
    const excel = files?.excel?.[0];
    const photos = files?.photos?.[0];
    if (!excel?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file Excel (.xlsx)');
    }
    if (!photos?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file ZIP chứa ảnh');
    }
    const result = await this.usersService.importFromExcelAndPhotos(excel, photos);
    return successResponse(result);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const row = await this.usersService.findOne(id);
    this.projectScope.assertProjectInScope(await this.projectScope.scopeFromLiveUser(user), row.projectId);
    return successResponse(row);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    this.projectScope.assertProjectInScope(await this.projectScope.scopeFromLiveUser(user), dto.projectId);
    const created = await this.usersService.create(dto);
    return successResponse(created, 'User created');
  }

  @Post(':id/provision')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  async provision(@Param('id') id: string, @Body() dto: ProvisionUserDto) {
    const result = await this.usersService.provision(id, dto);
    return successResponse(result, 'Đã cấp quyền khu vực');
  }

  @Post(':id/transfer-project')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  async transferProject(
    @Param('id') id: string,
    @Body() dto: TransferUserProjectDto,
    @CurrentUser() account: JwtPayload,
  ) {
    const existing = await this.usersService.findOne(id);
    const scope = await this.projectScope.scopeFromLiveUser(account);
    this.projectScope.assertProjectInScope(scope, existing.projectId);
    this.projectScope.assertProjectInScope(scope, dto.toProjectId);
    const result = await this.usersService.transferProject(id, dto, account.sub);
    return successResponse(result, 'Đã điều chuyển dự án');
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const existing = await this.usersService.findOne(id);
    const scope = await this.projectScope.scopeFromLiveUser(user);
    this.projectScope.assertProjectInScope(scope, existing.projectId);
    if (dto.projectId !== undefined) {
      this.projectScope.assertProjectInScope(scope, dto.projectId);
    }
    const updated = await this.usersService.update(id, dto);
    return successResponse(updated, 'User updated');
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const existing = await this.usersService.findOne(id);
    this.projectScope.assertProjectInScope(await this.projectScope.scopeFromLiveUser(user), existing.projectId);
    const result = await this.usersService.remove(id);
    const failed = result.deviceRemove?.failed ?? 0;
    const message =
      failed > 0
        ? `Đã ẩn nhân sự; ${failed} thiết bị xóa Face thất bại — kiểm tra panel thủ công`
        : 'Đã ẩn nhân sự và gỡ Face trên thiết bị';
    return successResponse(result, message);
  }
}

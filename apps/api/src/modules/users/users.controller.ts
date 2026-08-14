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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
    const scope = this.projectScope.scopeFromUser(user);
    const scopeFilter = this.projectScope.mergeProjectFilter(scope, query.projectId);
    const result = await this.usersService.findAll(query, scopeFilter);
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get('ids')
  async findIds(@Query() query: UsersIdsQueryDto, @CurrentUser() user: JwtPayload) {
    const scope = this.projectScope.scopeFromUser(user);
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
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Vui lòng chọn file Excel (.xlsx) hoặc ZIP');
    }
    const result = await this.usersService.importFromUpload(file);
    return successResponse(result);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const row = await this.usersService.findOne(id);
    this.projectScope.assertProjectInScope(
      this.projectScope.scopeFromUser(user),
      row.projectId,
    );
    return successResponse(row);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    this.projectScope.assertProjectInScope(
      this.projectScope.scopeFromUser(user),
      dto.projectId,
    );
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
    const scope = this.projectScope.scopeFromUser(account);
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
    this.projectScope.assertProjectInScope(
      this.projectScope.scopeFromUser(user),
      existing.projectId,
    );
    if (dto.projectId !== undefined) {
      this.projectScope.assertProjectInScope(
        this.projectScope.scopeFromUser(user),
        dto.projectId,
      );
    }
    const updated = await this.usersService.update(id, dto);
    return successResponse(updated, 'User updated');
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const existing = await this.usersService.findOne(id);
    this.projectScope.assertProjectInScope(
      this.projectScope.scopeFromUser(user),
      existing.projectId,
    );
    await this.usersService.remove(id);
    return successResponse(null, 'User deleted');
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { UserRole } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { RolesGuard } from '../../common/guards/roles.guard';

import { ProjectScopeService } from '../../common/services/project-scope.service';

import { successResponse } from '../../common/utils/response.util';

import type { JwtPayload } from '../auth/jwt.strategy';

import { ProjectsService } from './projects.service';

import { CreateProjectDto } from './dto/create-project.dto';

import { UpdateProjectDto } from './dto/update-project.dto';



@ApiTags('projects')

@ApiBearerAuth()

@Controller('projects')

export class ProjectsController {

  constructor(

    private readonly service: ProjectsService,

    private readonly projectScope: ProjectScopeService,

  ) {}



  @Get()

  async findAll(@Query('contractorId') contractorId?: string, @CurrentUser() user?: JwtPayload) {

    const scope = this.projectScope.scopeFromUser(user);

    return successResponse(await this.service.findAll(contractorId, scope));

  }



  @Get(':id')

  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {

    this.projectScope.assertProjectInScope(this.projectScope.scopeFromUser(user), id);

    return successResponse(await this.service.findOne(id));

  }



  @Post()

  @UseGuards(RolesGuard)

  @Roles(UserRole.ADMIN)

  async create(@Body() dto: CreateProjectDto) {

    return successResponse(await this.service.create(dto), 'Đã tạo dự án');

  }



  @Patch(':id')

  @UseGuards(RolesGuard)

  @Roles(UserRole.ADMIN)

  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {

    return successResponse(await this.service.update(id, dto), 'Đã cập nhật dự án');

  }



  @Delete(':id')

  @UseGuards(RolesGuard)

  @Roles(UserRole.ADMIN)

  async remove(@Param('id') id: string) {

    await this.service.remove(id);

    return successResponse(null, 'Đã xóa dự án');

  }

}



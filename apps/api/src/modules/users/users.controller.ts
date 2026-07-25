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
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { paginatedResponse, successResponse } from '../../common/utils/response.util';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { UsersIdsQueryDto, UsersQueryDto } from './dto/users-query.dto';
import { sendXlsx } from './users-excel.util';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Query() query: UsersQueryDto) {
    const result = await this.usersService.findAll(query);
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get('ids')
  async findIds(@Query() query: UsersIdsQueryDto) {
    const result = await this.usersService.findIds(query);
    return successResponse(result);
  }

  @Get('import-template')
  async importTemplate(@Res() res: Response) {
    const buffer = await this.usersService.buildImportTemplateBuffer();
    sendXlsx(res, buffer, 'users-import-template.xlsx');
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
      throw new BadRequestException('Vui lòng chọn file Excel (.xlsx) hoặc ZIP');
    }
    const result = await this.usersService.importFromUpload(file);
    return successResponse(result);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    return successResponse(user);
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return successResponse(user, 'User created');
  }

  @Post(':id/provision')
  async provision(@Param('id') id: string, @Body() dto: ProvisionUserDto) {
    const result = await this.usersService.provision(id, dto);
    return successResponse(result, 'Đã cấp quyền khu vực');
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const user = await this.usersService.update(id, dto);
    return successResponse(user, 'User updated');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return successResponse(null, 'User deleted');
  }
}

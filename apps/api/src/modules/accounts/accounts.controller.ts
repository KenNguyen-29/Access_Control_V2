import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { paginatedResponse, successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AccountsService } from './accounts.service';
import { AccountsQueryDto, CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  async findAll(@Query() query: AccountsQueryDto) {
    const result = await this.service.findAll(query);
    return paginatedResponse(result.items, result.total, result.page, result.pageSize);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return successResponse(await this.service.findOne(id));
  }

  @Post()
  async create(@Body() dto: CreateAccountDto) {
    return successResponse(await this.service.create(dto), 'Đã tạo tài khoản');
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.service.update(id, dto, user.sub),
      'Đã cập nhật tài khoản',
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.service.remove(id, user.sub);
    return successResponse(null, 'Đã xóa tài khoản');
  }
}

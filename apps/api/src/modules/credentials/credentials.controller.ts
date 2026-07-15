import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { successResponse } from '../../common/utils/response.util';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';

@ApiTags('credentials')
@ApiBearerAuth()
@Controller('credentials')
export class CredentialsController {
  constructor(private readonly service: CredentialsService) {}

  @Get()
  async find(
    @Query('userId') userId?: string,
    @Query('status') status?: 'active' | 'revoked',
  ) {
    if (userId) {
      return successResponse(await this.service.findByUser(userId));
    }
    return successResponse(await this.service.findAll(status));
  }

  @Post('face-enroll')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        image: { type: 'string', format: 'binary', description: 'Ảnh khuôn mặt JPG' },
      },
      required: ['userId', 'image'],
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async enrollFace(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
  ) {
    if (!userId?.trim()) {
      throw new BadRequestException('Thiếu userId');
    }
    return successResponse(
      await this.service.enrollFace(userId.trim(), file),
      'Đã lưu ảnh khuôn mặt',
    );
  }

  @Post()
  async create(@Body() dto: CreateCredentialDto) {
    return successResponse(await this.service.create(dto), 'Credential created');
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string) {
    return successResponse(await this.service.revoke(id), 'Credential revoked');
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return successResponse(null, 'Credential deleted');
  }
}

import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { StorageService } from './storage.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /** Serve FaceID JPG from local disk (path in PostgreSQL → file on hard drive). */
  @Public()
  @Get('face-images/:filename')
  serveFace(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new NotFoundException('File not found');
    }
    const relativePath = `face-images/${filename}`;
    if (!this.storage.existsOnDisk(relativePath)) {
      throw new NotFoundException('File not found');
    }
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    });
    return new StreamableFile(this.storage.openLocalFile(relativePath));
  }
}

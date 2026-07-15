import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Multipart field: userId (ảnh JPG gửi qua field `image`). */
export class FaceEnrollDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Đồng bộ ngay lên các thiết bị Akuvox sau khi enroll' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

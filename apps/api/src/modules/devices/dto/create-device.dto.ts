import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceType } from '@prisma/client';

export class CreateDeviceDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty({ enum: DeviceType })
  @IsEnum(DeviceType)
  deviceType!: DeviceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  macAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rtspUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rtspUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rtspPassword?: string;

  @ApiPropertyOptional({ description: 'Tài khoản HTTP API của Akuvox' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Mật khẩu HTTP API của Akuvox; để trống khi sửa để giữ nguyên' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ enum: ['http', 'https'], default: 'http' })
  @IsOptional()
  @IsIn(['http', 'https'])
  protocol?: 'http' | 'https';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  relay?: number;

  @ApiPropertyOptional({ description: 'Khu vực truy cập (AccessZone id)' })
  @IsOptional()
  @IsString()
  zoneId?: string;
}

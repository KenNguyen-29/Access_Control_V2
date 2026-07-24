import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceType } from '@prisma/client';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const RTSP = /^rtsps?:\/\/.+/i;

export class CreateDeviceDto {
  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên thiết bị' })
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã thiết bị' })
  @Matches(CODE, { message: 'Mã thiết bị không hợp lệ' })
  code!: string;

  @ApiProperty({ enum: DeviceType })
  @IsEnum(DeviceType)
  deviceType!: DeviceType;

  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập địa chỉ IP' })
  @Matches(IPV4, { message: 'Địa chỉ IP không đúng định dạng' })
  ipAddress!: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  macAddress?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @ValidateIf((o: CreateDeviceDto) => o.deviceType === DeviceType.CAMERA)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập RTSP URL cho camera' })
  @Matches(RTSP, { message: 'RTSP URL phải bắt đầu bằng rtsp:// hoặc rtsps://' })
  rtspUrl?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  rtspUsername?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  rtspPassword?: string;

  @ApiPropertyOptional({ description: 'Tài khoản HTTP API của Akuvox' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Mật khẩu HTTP API của Akuvox; để trống khi sửa để giữ nguyên' })
  @Transform(emptyToUndefined)
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

  @ApiPropertyOptional({ description: 'Khu vực truy cập (AccessZone id) — bắt buộc với Akuvox' })
  @Transform(emptyToUndefined)
  @ValidateIf((o: CreateDeviceDto) => o.deviceType === DeviceType.AKUVOX)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn khu vực cho thiết bị Akuvox' })
  zoneId?: string;
}

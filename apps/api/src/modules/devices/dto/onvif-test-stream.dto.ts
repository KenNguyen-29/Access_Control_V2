import { Transform, Type } from 'class-transformer';
import { IsIP, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trimOptional({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const RTSP = /^rtsps?:\/\/.+/i;

export class OnvifTestStreamDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsIP(4)
  ipAddress!: string;

  @ApiProperty({ description: 'Credential-free RTSP URL' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  @Matches(RTSP, { message: 'RTSP URL phải bắt đầu bằng rtsp:// hoặc rtsps://' })
  rtspUrl!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;

  @ApiPropertyOptional({ default: 7000, minimum: 1000, maximum: 15000 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(15000)
  timeoutMs?: number;
}

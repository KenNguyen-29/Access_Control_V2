import { Transform } from 'class-transformer';
import { IsIP, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trimOptional({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export class OnvifProfilesDto {
  @ApiProperty({ description: 'IPv4 address of the discovered camera' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsIP(4)
  ipAddress!: string;

  @ApiPropertyOptional({ description: 'Device-service XAddr returned by WS-Discovery' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceUrl?: string;

  @ApiPropertyOptional({ description: 'ONVIF username' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString()
  @MaxLength(256)
  username?: string;

  @ApiPropertyOptional({ description: 'ONVIF password' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;
}

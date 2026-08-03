import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccessAction } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AccessLogsQueryDto {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by access zone (construction site)' })
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional({
    enum: AccessAction,
    description: 'CHECK_IN | CHECK_OUT | DENIED | UNKNOWN. Use UNKNOWN for strangers if needed.',
  })
  @IsOptional()
  @IsEnum(AccessAction)
  action?: AccessAction;

  @ApiPropertyOptional({
    description: 'When true, only unknown persons (no matched user)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  unknownOnly?: boolean;

  @ApiPropertyOptional({ description: 'Filter by isValid flag' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  isValid?: boolean;
}

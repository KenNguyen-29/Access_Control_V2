import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateWorkShiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(HH_MM, { message: 'Giờ bắt đầu phải dạng HH:mm' })
  startTime?: string;

  @ApiPropertyOptional({ example: '06:00' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Matches(HH_MM, { message: 'Giờ kết thúc phải dạng HH:mm' })
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryCoefficient?: number;
}

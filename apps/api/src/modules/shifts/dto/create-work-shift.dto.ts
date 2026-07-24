import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateWorkShiftDto {
  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên ca' })
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã ca' })
  @Matches(CODE, { message: 'Mã ca không hợp lệ' })
  code!: string;

  @ApiProperty({ example: '08:00' })
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập giờ bắt đầu' })
  @Matches(HH_MM, { message: 'Giờ bắt đầu phải dạng HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập giờ kết thúc' })
  @Matches(HH_MM, { message: 'Giờ kết thúc phải dạng HH:mm' })
  endTime!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  breakMinutes?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @ApiPropertyOptional({ default: 5, description: 'Minutes after startTime still counted as on-time' })
  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodMinutes?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(10)
  salaryCoefficient?: number;
}

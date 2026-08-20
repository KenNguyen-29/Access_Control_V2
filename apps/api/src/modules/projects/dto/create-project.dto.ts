import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export class CreateProjectDto {
  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên dự án' })
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(CODE, { message: 'Mã dự án không hợp lệ' })
  code?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteName?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Type(() => String)
  contractorIds?: string[];
}

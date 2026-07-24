import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export class CreateDepartmentDto {
  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên phòng ban' })
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã phòng ban' })
  @Matches(CODE, { message: 'Mã phòng ban không hợp lệ' })
  code!: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

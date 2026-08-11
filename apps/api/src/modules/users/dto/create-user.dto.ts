import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserType } from '@prisma/client';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function normalizePhone({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/[\s.\-()]/g, '');
}

const VN_PHONE_PATTERN = /^(0|\+84|84)(3|5|7|8|9)\d{8}$/;

export class CreateUserDto {
  @ApiPropertyOptional({ description: 'Để trống để hệ thống tự sinh dạng NV-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  employeeCode?: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @Transform(emptyToUndefined)
  @IsString({ message: 'Họ tên không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  @MinLength(2, { message: 'Họ tên tối thiểu 2 ký tự' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  fullName!: string;

  @ApiProperty({ example: 'user@example.com' })
  @Transform(emptyToUndefined)
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Vui lòng nhập email' })
  @MaxLength(254, { message: 'Email quá dài' })
  email!: string;

  @ApiProperty({ example: '0912345678' })
  @Transform(normalizePhone)
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập số điện thoại' })
  @Matches(VN_PHONE_PATTERN, {
    message: 'Số điện thoại không đúng định dạng (vd. 0912345678 hoặc +84912345678)',
  })
  phone!: string;

  @ApiPropertyOptional({ enum: UserType })
  @IsOptional()
  @IsEnum(UserType)
  userType?: UserType;

  @ApiPropertyOptional({ description: 'CCCD' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  citizenId?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  contractorId?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  projectId?: string;
}

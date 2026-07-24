import { IsDateString, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateOnOrAfter } from '../../../common/validators/date-range.validator';

function emptyToUndefined({ value }: { value: unknown }) {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export class UpdateEmployeeShiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workShiftId?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' })
  startDate?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' })
  @IsDateOnOrAfter('startDate')
  endDate?: string | null;
}

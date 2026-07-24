import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateOnOrAfter } from '../../../common/validators/date-range.validator';
import {
  EMPLOYEE_SHIFT_ASSIGN_MODES,
  type EmployeeShiftAssignMode,
} from './bulk-assign-employee-shift.dto';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export class CreateEmployeeShiftDto {
  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty()
  workShiftId!: string;

  @ApiPropertyOptional({ enum: EMPLOYEE_SHIFT_ASSIGN_MODES, default: 'RANGED' })
  @IsOptional()
  @IsIn(EMPLOYEE_SHIFT_ASSIGN_MODES)
  mode?: EmployeeShiftAssignMode;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @Transform(emptyToUndefined)
  @ValidateIf((o: CreateEmployeeShiftDto) => (o.mode ?? 'RANGED') === 'RANGED')
  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngày bắt đầu' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @Transform(emptyToUndefined)
  @ValidateIf((o: CreateEmployeeShiftDto) => (o.mode ?? 'RANGED') === 'RANGED')
  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngày kết thúc' })
  @IsDateOnOrAfter('startDate')
  endDate?: string;
}

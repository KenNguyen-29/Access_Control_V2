import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateOnOrAfter } from '../../../common/validators/date-range.validator';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export const EMPLOYEE_SHIFT_ASSIGN_MODES = ['FIXED', 'RANGED'] as const;
export type EmployeeShiftAssignMode = (typeof EMPLOYEE_SHIFT_ASSIGN_MODES)[number];

export class BulkAssignEmployeeShiftDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Chọn ít nhất một nhân viên' })
  @IsString({ each: true })
  userIds!: string[];

  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn ca làm việc' })
  workShiftId!: string;

  @ApiProperty({ enum: EMPLOYEE_SHIFT_ASSIGN_MODES, default: 'RANGED' })
  @IsIn(EMPLOYEE_SHIFT_ASSIGN_MODES, { message: 'Kiểu gán ca không hợp lệ' })
  mode!: EmployeeShiftAssignMode;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @Transform(emptyToUndefined)
  @ValidateIf((o: BulkAssignEmployeeShiftDto) => o.mode === 'RANGED')
  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngày bắt đầu' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @Transform(emptyToUndefined)
  @ValidateIf((o: BulkAssignEmployeeShiftDto) => o.mode === 'RANGED')
  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngày kết thúc' })
  @IsDateOnOrAfter('startDate')
  endDate?: string;
}

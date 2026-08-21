import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class EmployeeShiftsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workShiftId?: string;

  @ApiPropertyOptional({ description: 'Search name, employee code, or shift name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['ALL', 'ACTIVE', 'EXPIRING_SOON', 'ENDED'],
    description: 'Assignment status filter',
  })
  @IsOptional()
  @IsIn(['ALL', 'ACTIVE', 'EXPIRING_SOON', 'ENDED'])
  status?: 'ALL' | 'ACTIVE' | 'EXPIRING_SOON' | 'ENDED';

  @ApiPropertyOptional({
    enum: ['FIXED', 'RANGED'],
    description: 'Assignment type filter',
  })
  @IsOptional()
  @IsIn(['FIXED', 'RANGED'])
  assignmentType?: 'FIXED' | 'RANGED';
}

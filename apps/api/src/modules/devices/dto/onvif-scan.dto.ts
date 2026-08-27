import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class OnvifScanDto {
  @ApiPropertyOptional({ default: 5000, minimum: 500, maximum: 15000 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(15000)
  timeoutMs?: number;
}

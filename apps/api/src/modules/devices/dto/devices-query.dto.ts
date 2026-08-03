import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class DevicesQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by access zone (construction site)' })
  @IsOptional()
  @IsString()
  zoneId?: string;
}

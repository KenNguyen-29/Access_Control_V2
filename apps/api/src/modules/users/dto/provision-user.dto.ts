import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class ProvisionUserDto {
  @ApiProperty({ type: [String], description: 'Khu vực cần cấp quyền và đồng bộ' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  zoneIds!: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoSync?: boolean;
}

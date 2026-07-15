import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeviceMappingDto {
  @ApiProperty()
  @IsString()
  akuvoxDeviceId!: string;

  @ApiProperty()
  @IsString()
  cameraDeviceId!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

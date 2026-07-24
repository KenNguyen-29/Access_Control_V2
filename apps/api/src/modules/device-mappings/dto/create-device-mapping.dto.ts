import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export class CreateDeviceMappingDto {
  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn đầu đọc Akuvox' })
  akuvoxDeviceId!: string;

  @ApiProperty()
  @Transform(emptyToUndefined)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn camera' })
  cameraDeviceId!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

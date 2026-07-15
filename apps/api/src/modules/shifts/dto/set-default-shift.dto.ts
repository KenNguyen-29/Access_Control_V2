import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetDefaultShiftDto {
  @ApiProperty()
  @IsString()
  workShiftId!: string;
}

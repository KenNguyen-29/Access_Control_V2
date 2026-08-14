import { IsOptional, IsString, MinLength } from 'class-validator';

export class TransferUserProjectDto {
  @IsString()
  @MinLength(1)
  toProjectId!: string;

  /** Exactly one target zone after transfer. */
  @IsString()
  @MinLength(1)
  zoneId!: string;

  @IsOptional()
  @IsString()
  workShiftId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

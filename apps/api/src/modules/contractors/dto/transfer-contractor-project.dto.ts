import { IsString, MinLength } from 'class-validator';

export class TransferContractorProjectDto {
  @IsString()
  @MinLength(1)
  fromProjectId!: string;

  @IsString()
  @MinLength(1)
  toProjectId!: string;
}

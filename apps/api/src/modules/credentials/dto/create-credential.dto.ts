import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CredentialType } from '@prisma/client';

export class CreateCredentialDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ enum: CredentialType, default: CredentialType.FACE })
  @IsOptional()
  @IsEnum(CredentialType)
  type?: CredentialType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cardNumber?: string;
}

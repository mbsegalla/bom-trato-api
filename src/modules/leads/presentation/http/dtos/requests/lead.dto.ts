import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';

import { LeadStatus } from '../../../../../../generated/prisma/enums.js';
import { PageDto } from '../../../../../../infrastructure/http/dtos/page.dto.js';

function nullableText({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() || null : value;
}

export class CreatePublicLeadDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  requestKey!: string;

  @ApiProperty({ minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 254 })
  @Transform(nullableText)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 20 })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[\d\s().-]+$/)
  phone?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(nullableText)
  @IsOptional()
  @IsUUID('4')
  catalogServiceId?: string | null;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(10, 2000)
  message!: string;
}

export class LeadPageDto extends PageDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;
}

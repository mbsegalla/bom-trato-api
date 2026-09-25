import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

import { OrganizationDocumentType } from '../../../../../../generated/prisma/enums.js';

function nullableText({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim() || null;
}

function nullableDigits({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.replace(/\D/g, '');

  return normalized || null;
}

function nullableDocumentType({ value }: { value: unknown }): unknown {
  return value === '' ? null : value;
}

export class UpdateOrganizationProfileDto {
  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 254,
  })
  @Transform(nullableText)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 30,
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({
    enum: OrganizationDocumentType,
    nullable: true,
  })
  @Transform(nullableDocumentType)
  @IsOptional()
  @IsEnum(OrganizationDocumentType)
  documentType?: OrganizationDocumentType | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'CPF or CNPJ containing only digits after normalization.',
  })
  @Transform(nullableDigits)
  @IsOptional()
  @Matches(/^(?:\d{11}|\d{14})$/)
  document?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 150,
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  addressLine1?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 100,
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressLine2?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 100,
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 2,
    maxLength: 2,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || null : value,
  )
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  state?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
  })
  @Transform(nullableDigits)
  @IsOptional()
  @Matches(/^\d{8}$/)
  postalCode?: string | null;
}

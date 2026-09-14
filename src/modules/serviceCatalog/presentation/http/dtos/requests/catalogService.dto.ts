import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { ServiceUnit } from '../../../../../../generated/prisma/enums.js';
import { catalogServiceStatuses } from '../../../../domain/types/catalogServicePage.types.js';

class CatalogServiceDescriptionDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class CreateCatalogServiceDto extends CatalogServiceDescriptionDto {
  @ApiProperty({
    minLength: 2,
    maxLength: 100,
    example: 'Instalação de ar-condicionado',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({
    enum: ServiceUnit,
    default: ServiceUnit.SERVICE,
  })
  @IsEnum(ServiceUnit)
  unit: ServiceUnit = ServiceUnit.SERVICE;

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 2147483647,
    example: 35000,
  })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  amountInCents!: number;
}

export class UpdateCatalogServiceDto extends CatalogServiceDescriptionDto {
  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ enum: ServiceUnit })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(ServiceUnit)
  unit?: ServiceUnit;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: 2147483647,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  amountInCents?: number;
}

export class CatalogServicePageDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: 10000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({
    enum: catalogServiceStatuses,
    default: 'ACTIVE',
  })
  @IsIn(catalogServiceStatuses)
  status: (typeof catalogServiceStatuses)[number] = 'ACTIVE';
}

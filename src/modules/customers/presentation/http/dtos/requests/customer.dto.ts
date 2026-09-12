import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { customerStatuses } from '../../../../domain/types/customerPage.types.js';

function nullableText({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() || null : value;
}

class CustomerContactDto {
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
    type: String,
    nullable: true,
    maxLength: 5000,
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class CreateCustomerDto extends CustomerContactDto {
  @ApiProperty({
    minLength: 2,
    maxLength: 100,
    example: 'Maria Silva',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  name!: string;
}

export class UpdateCustomerDto extends CustomerContactDto {
  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(2, 100)
  name?: string;
}

export class CustomerPageDto {
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

  @ApiPropertyOptional({
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({
    enum: customerStatuses,
    default: 'ACTIVE',
  })
  @IsIn(customerStatuses)
  status: (typeof customerStatuses)[number] = 'ACTIVE';
}

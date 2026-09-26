import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';

import { PageDto } from '../../../../../../infrastructure/http/dtos/page.dto.js';
import { customerStatuses } from '../../../../domain/types/customer.types.js';

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
    maxLength: 20,
    example: '(34) 99999-9999',
  })
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[\d\s().-]+$/)
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

export class CustomerPageDto extends PageDto {
  @ApiPropertyOptional({ maxLength: 100 })
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

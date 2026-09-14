import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { QuoteStatus, ServiceUnit } from '../../../../../../generated/prisma/enums.js';
import { PageDto } from '../../../../../../infrastructure/http/dtos/page.dto.js';

class QuoteDetailsDto {
  @ApiProperty({ minLength: 2, maxLength: 150 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 150)
  title!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 5000,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsISO8601({
    strict: true,
    strictSeparator: true,
  })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  validUntil?: string | null;
}

export class CreateQuoteDto extends QuoteDetailsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId!: string;
}

export class QuoteVersionDto {
  @ApiProperty({
    minimum: 1,
    maximum: 2147483647,
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
}

export class UpdateQuoteDto extends PartialType(QuoteDetailsDto, { skipNullProperties: false }) {
  @ApiProperty({
    minimum: 1,
    maximum: 2147483647,
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 2147483647,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  discountInCents?: number;
}

export class CustomQuoteItemDto {
  @ApiProperty({
    minLength: 2,
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ enum: ServiceUnit })
  @IsEnum(ServiceUnit)
  unit!: ServiceUnit;

  @ApiProperty({
    minimum: 0,
    maximum: 2147483647,
  })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  unitAmountInCents!: number;
}

export class QuoteItemDto extends QuoteVersionDto {
  @ApiProperty({
    type: String,
    example: '1.500',
    description: 'Positive quantity with up to three decimal places',
  })
  @IsString()
  @Matches(/^\d{1,6}(\.\d{1,3})?$/)
  quantity!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  catalogServiceId?: string;

  @ApiPropertyOptional({ type: CustomQuoteItemDto })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => CustomQuoteItemDto)
  custom?: CustomQuoteItemDto;
}

export class QuotePageDto extends PageDto {
  @ApiPropertyOptional({ enum: QuoteStatus })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  customerId?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { ReceivablePaymentMethod, ReceivableStatus } from '../../../../../../generated/prisma/enums.js';
import { PageDto } from '../../../../../../infrastructure/http/dtos/page.dto.js';

export class ReceivableVersionDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
}

export class CreateReceivableDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  workOrderId!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-10T23:59:59-03:00',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  dueAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateReceivableDto extends ReceivableVersionDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  dueAt?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CancelReceivableDto extends ReceivableVersionDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class RecordReceivablePaymentDto extends ReceivableVersionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Reuse this UUID only when retrying the same payment.',
  })
  @IsUUID('4')
  requestId!: string;

  @ApiProperty({
    minimum: 1,
    maximum: 2147483647,
    example: 15000,
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  amountInCents!: number;

  @ApiProperty({ enum: ReceivablePaymentMethod })
  @IsEnum(ReceivablePaymentMethod)
  method!: ReceivablePaymentMethod;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  receivedAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ReverseReceivablePaymentDto extends ReceivableVersionDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class ReceivablePageDto extends PageDto {
  @ApiPropertyOptional({ enum: ReceivableStatus })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(ReceivableStatus)
  status?: ReceivableStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  workOrderId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return value;
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  dueFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  dueTo?: string;
}

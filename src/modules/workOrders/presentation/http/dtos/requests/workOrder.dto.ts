import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
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

import { WorkOrderStatus } from '../../../../../../generated/prisma/enums.js';

export class CreateWorkOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  quoteId!: string;
}

export class WorkOrderVersionDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  version!: number;
}

export class UpdateWorkOrderDto extends WorkOrderVersionDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 150 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @Length(2, 150)
  title?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(5000)
  instructions?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(500)
  serviceAddress?: string | null;
}

export class AssignWorkOrderDto extends WorkOrderVersionDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsDefined()
  @IsUUID('4')
  assignedToId!: string | null;
}

export class ScheduleWorkOrderDto extends WorkOrderVersionDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledStartAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledEndAt!: string;
}

export class WorkOrderExecutionNotesDto extends WorkOrderVersionDto {
  @ApiProperty({ type: String, nullable: true, maxLength: 10000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsDefined()
  @IsString()
  @MaxLength(10000)
  executionNotes!: string | null;
}

export class CancelWorkOrderDto extends WorkOrderVersionDto {
  @ApiProperty({ minLength: 5, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(5, 1000)
  reason!: string;
}

export class WorkOrderPageDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: WorkOrderStatus })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  assignedToId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledTo?: string;
}

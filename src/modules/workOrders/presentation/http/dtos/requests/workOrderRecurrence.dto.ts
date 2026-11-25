import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { PageDto } from '../../../../../../infrastructure/http/dtos/page.dto.js';
import type {
  WorkOrderRecurrenceListInput,
  WorkOrderRecurrenceListStatus,
} from '../../../../application/types/workOrderRecurrence.types.js';
import type {
  WorkOrderRecurrenceSettings,
  WorkOrderRecurrenceUnit,
} from '../../../../domain/policies/workOrderRecurrence.policy.js';
import type { WorkOrderRecurrenceVisitPeriod } from '../../../../domain/policies/workOrderRecurrenceVisit.policy.js';

export class SaveWorkOrderRecurrenceDto implements WorkOrderRecurrenceSettings {
  @ApiProperty({ enum: ['DAY', 'WEEK', 'MONTH'] })
  @IsIn(['DAY', 'WEEK', 'MONTH'])
  intervalUnit!: WorkOrderRecurrenceUnit;

  @ApiProperty({ minimum: 1, maximum: 365, description: 'Maximum: 365 days, 52 weeks or 12 months.' })
  @IsInt()
  @Min(1)
  @Max(365)
  intervalCount!: number;

  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  nextVisitOn!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ minimum: 0, maximum: 2147483647, description: 'Use 0 when creating the configuration.' })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  version!: number;
}

export class WorkOrderRecurrencePageDto extends PageDto implements WorkOrderRecurrenceListInput {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: WorkOrderRecurrenceListStatus;

  @ApiPropertyOptional({ enum: ['OVERDUE', 'TODAY', 'NEXT_SEVEN_DAYS'] })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['OVERDUE', 'TODAY', 'NEXT_SEVEN_DAYS'])
  visit?: WorkOrderRecurrenceVisitPeriod;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  customerName?: string;
}

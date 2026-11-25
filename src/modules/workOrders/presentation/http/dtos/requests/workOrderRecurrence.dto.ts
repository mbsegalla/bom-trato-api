import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';

import type {
  WorkOrderRecurrenceSettings,
  WorkOrderRecurrenceUnit,
} from '../../../../domain/policies/workOrderRecurrence.policy.js';

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

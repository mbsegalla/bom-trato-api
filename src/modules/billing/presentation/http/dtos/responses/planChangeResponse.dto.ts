import { ApiProperty } from '@nestjs/swagger';

import { BillingInterval, PlanChangeMode, PlanChangeStatus } from '../../../../../../generated/prisma/enums.js';

export class PlanChangeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  sourcePlanPriceId: string;

  @ApiProperty({ format: 'uuid' })
  targetPlanPriceId: string;

  @ApiProperty({ enum: PlanChangeMode })
  mode: PlanChangeMode;

  @ApiProperty({ enum: PlanChangeStatus })
  status: PlanChangeStatus;

  @ApiProperty({ example: 'brl' })
  currency: string;

  @ApiProperty()
  amountDueNow: number;

  @ApiProperty()
  targetAmountInCents: number;

  @ApiProperty({ enum: BillingInterval })
  targetInterval: BillingInterval;

  @ApiProperty()
  targetIntervalCount: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  effectiveAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  quoteExpiresAt: Date;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  clientSecret: string | null;
}

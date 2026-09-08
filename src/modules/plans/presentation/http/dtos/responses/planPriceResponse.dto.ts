import { ApiProperty } from '@nestjs/swagger';

import { BillingInterval } from '../../../../../../generated/prisma/enums.js';

export class PlanPriceResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: Number, example: 3990, description: 'Price in BRL cents.' })
  amountInCents: number;

  @ApiProperty({ type: String, example: 'brl' })
  currency: string;

  @ApiProperty({ type: String, enum: ['MONTH', 'YEAR'], enumName: 'BillingInterval' })
  interval: BillingInterval;

  @ApiProperty({ type: Number, example: 1 })
  intervalCount: number;
}

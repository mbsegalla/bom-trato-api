import { ApiProperty } from '@nestjs/swagger';

import { PaymentMethodUpdateStatus } from '../../../../../../generated/prisma/enums.js';

export class PaymentMethodUpdateResponseDto {
  @ApiProperty({ format: 'uuid' })
  updateId: string;

  @ApiProperty({
    enum: ['PENDING', 'APPLIED', 'CANCELED'],
  })
  status: PaymentMethodUpdateStatus;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  clientSecret: string | null;
}

export class CardResponseDto {
  @ApiProperty({ example: 'visa' })
  brand: string;

  @ApiProperty({ example: '4242' })
  last4: string;

  @ApiProperty({ example: 12 })
  expMonth: number;

  @ApiProperty({ example: 2028 })
  expYear: number;
}

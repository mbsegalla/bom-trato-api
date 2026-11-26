import { ApiProperty } from '@nestjs/swagger';

import type { ReceivablePixCharge } from '../../../../application/types/receivablePixCharge.types.js';

export class ReceivablePixChargeResponseDto implements ReceivablePixCharge {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  receivableId!: string;

  @ApiProperty()
  receivableVersion!: number;

  @ApiProperty()
  receivingSettingsVersion!: number;

  @ApiProperty({ description: 'Outstanding amount in BRL cents' })
  amountInCents!: number;

  @ApiProperty({ enum: ['brl'] })
  currency!: 'brl';

  @ApiProperty({ description: 'Configured display label, not bank-verified account name' })
  merchantName!: string;

  @ApiProperty({ description: 'Stable static Pix reference, not proof of payment' })
  txid!: string;

  @ApiProperty({ description: 'Static Pix BR Code; contains the configured receiving key' })
  copyAndPaste!: string;
}

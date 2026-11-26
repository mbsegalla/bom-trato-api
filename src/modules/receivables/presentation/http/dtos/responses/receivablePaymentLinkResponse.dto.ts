import { ApiProperty } from '@nestjs/swagger';

import type {
  PublicReceivablePaymentLink,
  ReceivablePaymentLinkStatus,
} from '../../../../application/types/receivablePaymentLink.types.js';

export class ReceivablePaymentLinkStatusDto implements ReceivablePaymentLinkStatus {
  @ApiProperty()
  active!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

export class CreatedReceivablePaymentLinkDto {
  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

export class PublicReceivablePaymentLinkResponseDto implements PublicReceivablePaymentLink {
  @ApiProperty()
  organizationName!: string;

  @ApiProperty()
  merchantName!: string;

  @ApiProperty()
  amountInCents!: number;

  @ApiProperty({ enum: ['brl'] })
  currency!: 'brl';

  @ApiProperty()
  copyAndPaste!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

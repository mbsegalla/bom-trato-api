import { ApiProperty } from '@nestjs/swagger';

import type {
  LivePixViewStatus,
  MercadoPagoLivePixView,
} from '../../../../application/types/mercadoPagoLivePix.types.js';

export class MercadoPagoLivePixResponseDto implements MercadoPagoLivePixView {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;
  @ApiProperty({ format: 'uuid' })
  receivableId!: string;
  @ApiProperty()
  receivableVersion!: number;
  @ApiProperty()
  available!: boolean;
  @ApiProperty()
  canIssue!: boolean;
  @ApiProperty()
  canRecover!: boolean;
  @ApiProperty({
    enum: ['NOT_ISSUED', 'PROCESSING', 'PENDING', 'REVIEW_REQUIRED', 'EXPIRED', 'STALE', 'SETTLED', 'CLOSED'],
  })
  status!: LivePixViewStatus;
  @ApiProperty({ type: String, nullable: true })
  issuanceId!: string | null;
  @ApiProperty({ type: Number, nullable: true })
  amountInCents!: number | null;
  @ApiProperty({ type: String, nullable: true })
  paymentId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: Date | null;
  @ApiProperty({ type: String, nullable: true })
  copyAndPaste!: string | null;
  @ApiProperty({ type: String, nullable: true })
  reviewCode!: string | null;
  @ApiProperty({ type: String, nullable: true })
  lastRecoveryCode!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nextRecoveryAt!: Date | null;
  @ApiProperty({ type: String, nullable: true })
  lastWebhookCode!: string | null;
  @ApiProperty({ enum: [true] })
  liveMode!: true;
}

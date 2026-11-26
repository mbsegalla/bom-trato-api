import { ApiProperty } from '@nestjs/swagger';

import type { MercadoPagoSandboxPixView, SandboxPixViewStatus } from '../../../../application/types/mercadoPagoSandboxPix.types.js';

export class MercadoPagoSandboxPixResponseDto implements MercadoPagoSandboxPixView {
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
  @ApiProperty({ enum: ['NOT_ISSUED', 'PROCESSING', 'PENDING', 'REVIEW_REQUIRED', 'EXPIRED', 'STALE'] })
  status!: SandboxPixViewStatus;
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
  @ApiProperty({ enum: [false] })
  liveMode!: false;
}

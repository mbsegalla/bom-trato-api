import { ApiProperty } from '@nestjs/swagger';

import type {
  MercadoPagoSandboxPixRecoveryView,
  SandboxPixRecoveryAttemptView,
  SandboxPixRecoveryStatus,
  SandboxPixVerifiedStatus,
  SandboxPixWebhookReviewView,
} from '../../../../application/types/mercadoPagoSandboxPixRecovery.types.js';
import { SANDBOX_RECOVERY_STATUSES } from '../../../../application/types/mercadoPagoSandboxPixRecovery.types.js';

class SandboxPixRecoveryAttemptDto implements SandboxPixRecoveryAttemptView {
  @ApiProperty({ enum: [...SANDBOX_RECOVERY_STATUSES] })
  status!: SandboxPixRecoveryStatus;
  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true })
  paymentId!: string | null;
}

class SandboxPixWebhookReviewDto implements SandboxPixWebhookReviewView {
  @ApiProperty({ enum: SANDBOX_RECOVERY_STATUSES.filter((status) => status.startsWith('VERIFIED_')) })
  status!: SandboxPixVerifiedStatus;
  @ApiProperty({ type: String, format: 'date-time' })
  receivedAt!: Date;
}

export class MercadoPagoSandboxPixRecoveryResponseDto implements MercadoPagoSandboxPixRecoveryView {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;
  @ApiProperty({ format: 'uuid' })
  receivableId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  issuanceId!: string | null;
  @ApiProperty()
  canRecover!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nextRecoveryAt!: Date | null;
  @ApiProperty({ type: SandboxPixRecoveryAttemptDto, nullable: true })
  lastAttempt!: SandboxPixRecoveryAttemptDto | null;
  @ApiProperty({ type: SandboxPixWebhookReviewDto, nullable: true })
  lastWebhook!: SandboxPixWebhookReviewDto | null;
}

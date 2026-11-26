export const SANDBOX_RECOVERY_STATUSES = [
  'IN_PROGRESS',
  'ABANDONED',
  'NOT_FOUND',
  'AMBIGUOUS',
  'INVALID_PROVIDER_PAYMENT',
  'PROVIDER_UNAVAILABLE',
  'CONNECTION_CHANGED',
  'BINDING_CONFLICT',
  'VERIFIED_PENDING',
  'VERIFIED_APPROVED',
  'VERIFIED_CLOSED',
  'VERIFIED_REFUNDED',
  'VERIFIED_REVIEW_REQUIRED',
] as const;

export type SandboxPixRecoveryStatus = (typeof SANDBOX_RECOVERY_STATUSES)[number];

export type SandboxPixVerifiedStatus = Extract<SandboxPixRecoveryStatus, `VERIFIED_${string}`>;

export interface SandboxPixRecoveryAttemptView {
  status: SandboxPixRecoveryStatus;
  startedAt: Date;
  completedAt: Date | null;
  paymentId: string | null;
}

export interface SandboxPixWebhookReviewView {
  status: SandboxPixVerifiedStatus;
  receivedAt: Date;
}

export interface MercadoPagoSandboxPixRecoveryView {
  organizationId: string;
  receivableId: string;
  issuanceId: string | null;
  canRecover: boolean;
  nextRecoveryAt: Date | null;
  lastAttempt: SandboxPixRecoveryAttemptView | null;
  lastWebhook: SandboxPixWebhookReviewView | null;
}

export interface RecoverMercadoPagoSandboxPixInput {
  issuanceId: string;
}

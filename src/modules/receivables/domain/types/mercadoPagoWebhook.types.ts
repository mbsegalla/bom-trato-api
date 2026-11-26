export interface MercadoPagoWebhookNotice {
  clientId: string;
  deliveryKey: string;
  paymentId: string;
  requestId: string;
  signedAt: Date;
}

export interface ClaimedMercadoPagoWebhook {
  clientId: string;
  deliveryKey: string;
  paymentId: string;
  leaseToken: string;
  attempts: number;
}

export interface SandboxPixWebhookBinding {
  issuanceId: string;
  organizationId: string;
  ownerId: string;
  clientId: string;
  accountId: string;
  paymentId: string;
  amountInCents: number;
}

export interface SandboxPixWebhookAccess {
  binding: SandboxPixWebhookBinding;
  connectedAt: Date;
  accessToken: string;
}

export type SandboxPixWebhookPreparation =
  | { kind: 'READY'; access: SandboxPixWebhookAccess }
  | { kind: 'RETRY'; code: 'UNMATCHED_PAYMENT' | 'CREDENTIAL_UNAVAILABLE' }
  | { kind: 'REVIEW'; code: 'AMBIGUOUS_PAYMENT' };

export type SandboxWebhookResultStatus = 'PENDING' | 'APPROVED' | 'CLOSED' | 'REFUNDED' | 'REVIEW_REQUIRED';

export type MercadoPagoWebhookOutcome =
  | { kind: 'RETRY'; code: 'UNMATCHED_PAYMENT' | 'CREDENTIAL_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE' | 'CONNECTION_CHANGED' | 'PROCESSING_FAILED' }
  | { kind: 'REVIEW'; code: 'AMBIGUOUS_PAYMENT' | 'INVALID_PROVIDER_PAYMENT' }
  | { kind: 'CHECKED'; binding: SandboxPixWebhookBinding; connectedAt: Date; status: SandboxWebhookResultStatus };

import type { VerifiedProviderPayment } from './receivableProviderPayment.types.js';

export interface LivePixWebhookBinding {
  issuanceId: string;
  organizationId: string;
  receivableId: string;
  receivableVersion: number;
  ownerId: string;
  clientId: string;
  accountId: string;
  paymentId: string;
  amountInCents: number;
}

export interface LivePixConnectionStamp {
  connectedAt: Date;
  updatedAt: Date;
}

export type LivePixObservation =
  | { status: 'APPROVED'; payment: VerifiedProviderPayment }
  | { status: 'PENDING' | 'CLOSED' | 'REFUNDED' | 'REVIEW_REQUIRED' | 'INVALID_PROVIDER_PAYMENT' };

export type LiveWebhookRetry = {
  kind: 'RETRY';
  code: 'UNMATCHED_PAYMENT' | 'CREDENTIAL_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE' | 'CONNECTION_CHANGED' | 'PROCESSING_FAILED';
};

export type LiveWebhookReview = {
  kind: 'REVIEW';
  code: 'INVALID_BINDING';
};

export type LiveWebhookOwnerChanged = {
  kind: 'OWNER_CHANGED';
  binding: LivePixWebhookBinding;
};

export type LiveWebhookPreparation =
  | LiveWebhookRetry
  | LiveWebhookReview
  | LiveWebhookOwnerChanged
  | { kind: 'READY'; binding: LivePixWebhookBinding; stamp: LivePixConnectionStamp; accessToken: string };

export type LiveWebhookOutcome =
  | LiveWebhookRetry
  | LiveWebhookReview
  | LiveWebhookOwnerChanged
  | { kind: 'CHECKED'; binding: LivePixWebhookBinding; stamp: LivePixConnectionStamp; observation: LivePixObservation };

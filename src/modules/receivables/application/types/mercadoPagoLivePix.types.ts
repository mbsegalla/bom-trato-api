import type { MercadoPagoConnectionActor } from './mercadoPagoConnection.types.js';

export interface MercadoPagoLivePixActor extends MercadoPagoConnectionActor {
  receivableId: string;
}

export interface IssueMercadoPagoLivePixInput {
  version: number;
  buyerEmail: string;
  buyerDocumentType: 'CPF' | 'CNPJ';
  buyerDocumentNumber: string;
  confirmed: boolean;
}

// Internal outcome only. No QR, token, payer data or public payment action.
export interface MercadoPagoLivePixIssuance {
  issuanceId: string;
  providerChargeId: string | null;
  status: 'RESERVED' | 'PENDING' | 'REVIEW_REQUIRED' | 'SETTLED' | 'CLOSED';
}

export type LivePixViewStatus =
  'NOT_ISSUED' | 'PROCESSING' | 'PENDING' | 'REVIEW_REQUIRED' | 'EXPIRED' | 'STALE' | 'SETTLED' | 'CLOSED';

export interface MercadoPagoLivePixView {
  organizationId: string;
  receivableId: string;
  receivableVersion: number;
  available: boolean;
  canIssue: boolean;
  canRecover: boolean;
  status: LivePixViewStatus;
  issuanceId: string | null;
  amountInCents: number | null;
  paymentId: string | null;
  expiresAt: Date | null;
  copyAndPaste: string | null;
  reviewCode: string | null;
  lastRecoveryCode: string | null;
  nextRecoveryAt: Date | null;
  lastWebhookCode: string | null;
  liveMode: true;
}

export interface RecoverMercadoPagoLivePixInput {
  issuanceId: string;
}

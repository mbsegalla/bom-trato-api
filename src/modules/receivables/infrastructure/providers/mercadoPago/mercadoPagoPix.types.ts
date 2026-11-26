import type { VerifiedProviderPayment } from '../../../domain/types/receivableProviderPayment.types.js';

export interface CreateMercadoPagoPixInput {
  // Must be the UUID of an immutable, durably reserved issuance attempt.
  // Use the same value for idempotency and external reference.
  issuanceId: string;
  accountId: string;
  accessToken: string;
  amountInCents: number;
  expiresAt: Date;
  payer: {
    email: string;
    identification: {
      type: 'CPF' | 'CNPJ';
      number: string;
    };
  };
}

interface CreatedPixIdentity {
  paymentId: string;
  accountId: string;
  issuanceId: string;
  amountInCents: number;
  currency: 'brl';
  liveMode: boolean;
}

export type CreatedMercadoPagoPix =
  | (CreatedPixIdentity & { kind: 'PENDING'; copyAndPaste: string; expiresAt: Date })
  | (CreatedPixIdentity & { kind: 'REVIEW_REQUIRED' });

// Authoritative read of an already bound sandbox payment, never a live payment.
export interface ReadMercadoPagoSandboxPixInput {
  issuanceId: string;
  accountId: string;
  paymentId: string;
  accessToken: string;
  amountInCents: number;
}

export type MercadoPagoSandboxPaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CLOSED'
  | 'REFUNDED'
  | 'REVIEW_REQUIRED';

export type SearchMercadoPagoSandboxPixInput = Omit<ReadMercadoPagoSandboxPixInput, 'paymentId'>;

export type SearchMercadoPagoSandboxPixResult =
  | { kind: 'NOT_FOUND' }
  | { kind: 'AMBIGUOUS' }
  | { kind: 'FOUND'; paymentId: string; status: MercadoPagoSandboxPaymentStatus };

export interface ReadMercadoPagoLivePixInput extends ReadMercadoPagoSandboxPixInput {
  eventId: string;
}

export type MercadoPagoLivePaymentObservation =
  | { status: 'APPROVED'; payment: VerifiedProviderPayment }
  | { status: Exclude<MercadoPagoSandboxPaymentStatus, 'APPROVED'> };

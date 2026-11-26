import type { MercadoPagoConnectionActor } from './mercadoPagoConnection.types.js';

export interface MercadoPagoSandboxPixActor extends MercadoPagoConnectionActor {
  receivableId: string;
}

export interface CreateMercadoPagoSandboxPixInput {
  version: number;
  testBuyerEmail: string;
  testDocumentType: 'CPF' | 'CNPJ';
  testDocumentNumber: string;
  confirmed: boolean;
}

export type SandboxPixViewStatus = 'NOT_ISSUED' | 'PROCESSING' | 'PENDING' | 'REVIEW_REQUIRED' | 'EXPIRED' | 'STALE';

export interface MercadoPagoSandboxPixView {
  organizationId: string;
  receivableId: string;
  receivableVersion: number;
  available: boolean;
  canIssue: boolean;
  status: SandboxPixViewStatus;
  issuanceId: string | null;
  amountInCents: number | null;
  paymentId: string | null;
  expiresAt: Date | null;
  copyAndPaste: string | null;
  liveMode: false;
}

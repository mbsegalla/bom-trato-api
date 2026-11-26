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

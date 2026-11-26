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

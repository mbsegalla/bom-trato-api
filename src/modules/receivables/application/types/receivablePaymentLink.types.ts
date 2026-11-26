export interface ReceivablePaymentLinkStatus {
  active: boolean;
  expiresAt: Date;
}

export interface CreatedReceivablePaymentLink {
  token: string;
  expiresAt: Date;
}

export interface PublicReceivablePaymentLink {
  organizationName: string;
  merchantName: string;
  amountInCents: number;
  currency: 'brl';
  copyAndPaste: string;
  expiresAt: Date;
}

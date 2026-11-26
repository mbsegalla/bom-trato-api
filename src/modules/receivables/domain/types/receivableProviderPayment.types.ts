export interface ProviderPaymentReference {
  provider: string;
  externalAccountId: string;
  externalPaymentId: string;
}

export interface RegisterProviderChargeInput extends ProviderPaymentReference {
  receivableVersion: number;
  expectedAmountInCents: number;
}

// Only a trusted adapter may construct this after authenticating the notification
// and retrieving the current settled payment from the provider account.
export interface VerifiedProviderPayment extends ProviderPaymentReference {
  liveMode: boolean;
  eventId: string;
  amountInCents: number;
  currency: string;
  paidAt: Date;
}

export type ProviderPaymentReviewReason =
  | 'CURRENCY_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'RECEIVABLE_CHANGED'
  | 'RECEIVABLE_INELIGIBLE'
  | 'OWNER_CHANGED'
  | 'REQUEST_ID_CONFLICT';

export type ProviderPaymentResult = 'APPLIED' | 'DUPLICATE' | 'REVIEW_REQUIRED' | 'UNMATCHED' | 'IGNORED_TEST';

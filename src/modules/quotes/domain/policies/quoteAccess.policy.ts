import { QuoteError } from '../errors/quote.error.js';

export interface QuoteAccessContext {
  isMember: boolean;
  verified: boolean;
  hasSubscriptionAccess: boolean;
  billingNeedsReconciliation: boolean;
}

export class QuoteAccessPolicy {
  private readonly context: QuoteAccessContext;

  constructor(context: QuoteAccessContext) {
    this.context = { ...context };
  }

  assertCanManage(): void {
    if (!this.context.isMember) {
      throw new QuoteError('MEMBER_REQUIRED');
    }

    if (!this.context.verified) {
      throw new QuoteError('VERIFIED_USER_REQUIRED');
    }

    if (this.context.billingNeedsReconciliation) {
      throw new QuoteError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (!this.context.hasSubscriptionAccess) {
      throw new QuoteError('SUBSCRIPTION_REQUIRED');
    }
  }
}

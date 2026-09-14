import { ReceivableError } from '../errors/receivable.error.js';

export interface ReceivableAccessContext {
  isMember: boolean;
  verified: boolean;
  hasSubscriptionAccess: boolean;
  billingNeedsReconciliation: boolean;
}

export class ReceivableAccessPolicy {
  constructor(private readonly context: ReceivableAccessContext) {}

  assertCanManage(): void {
    if (!this.context.isMember) {
      throw new ReceivableError('MEMBER_REQUIRED');
    }

    if (!this.context.verified) {
      throw new ReceivableError('VERIFIED_USER_REQUIRED');
    }

    if (this.context.billingNeedsReconciliation) {
      throw new ReceivableError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (!this.context.hasSubscriptionAccess) {
      throw new ReceivableError('SUBSCRIPTION_REQUIRED');
    }
  }
}

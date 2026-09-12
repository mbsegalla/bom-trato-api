import { CustomerError } from '../errors/customer.error.js';

export interface CustomerAccessContext {
  isMember: boolean;
  verified: boolean;
  hasSubscriptionAccess: boolean;
  billingNeedsReconciliation: boolean;
}

export class CustomerAccessPolicy {
  private readonly context: CustomerAccessContext;

  constructor(context: CustomerAccessContext) {
    this.context = { ...context };
  }

  assertCanManage(): void {
    if (!this.context.isMember) {
      throw new CustomerError('MEMBER_REQUIRED');
    }

    if (!this.context.verified) {
      throw new CustomerError('VERIFIED_USER_REQUIRED');
    }

    if (this.context.billingNeedsReconciliation) {
      throw new CustomerError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (!this.context.hasSubscriptionAccess) {
      throw new CustomerError('SUBSCRIPTION_REQUIRED');
    }
  }
}

import { DashboardError } from '../errors/dashboard.error.js';

export interface DashboardAccessContext {
  isMember: boolean;
  verified: boolean;
  hasSubscriptionAccess: boolean;
  billingNeedsReconciliation: boolean;
}

export class DashboardAccessPolicy {
  constructor(private readonly context: DashboardAccessContext) {}

  assertCanRead(): void {
    if (!this.context.isMember) {
      throw new DashboardError('MEMBER_REQUIRED');
    }

    if (!this.context.verified) {
      throw new DashboardError('VERIFIED_USER_REQUIRED');
    }

    if (this.context.billingNeedsReconciliation) {
      throw new DashboardError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (!this.context.hasSubscriptionAccess) {
      throw new DashboardError('SUBSCRIPTION_REQUIRED');
    }
  }
}

import { WorkOrderError } from '../errors/workOrder.error.js';

export interface WorkOrderAccessContext {
  isMember: boolean;
  verified: boolean;
  hasSubscriptionAccess: boolean;
  billingNeedsReconciliation: boolean;
}

export class WorkOrderAccessPolicy {
  constructor(private readonly context: WorkOrderAccessContext) {}

  assertCanManage(): void {
    if (!this.context.isMember) {
      throw new WorkOrderError('MEMBER_REQUIRED');
    }

    if (!this.context.verified) {
      throw new WorkOrderError('VERIFIED_USER_REQUIRED');
    }

    if (this.context.billingNeedsReconciliation) {
      throw new WorkOrderError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (!this.context.hasSubscriptionAccess) {
      throw new WorkOrderError('SUBSCRIPTION_REQUIRED');
    }
  }
}

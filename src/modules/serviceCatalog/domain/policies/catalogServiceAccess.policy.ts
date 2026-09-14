import { CatalogServiceError } from '../errors/catalogService.error.js';

export interface CatalogServiceAccessContext {
  isMember: boolean;
  verified: boolean;
  hasSubscriptionAccess: boolean;
  billingNeedsReconciliation: boolean;
}

export class CatalogServiceAccessPolicy {
  private readonly context: CatalogServiceAccessContext;

  constructor(context: CatalogServiceAccessContext) {
    this.context = { ...context };
  }

  assertCanManage(): void {
    if (!this.context.isMember) {
      throw new CatalogServiceError('MEMBER_REQUIRED');
    }

    if (!this.context.verified) {
      throw new CatalogServiceError('VERIFIED_USER_REQUIRED');
    }

    if (this.context.billingNeedsReconciliation) {
      throw new CatalogServiceError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (!this.context.hasSubscriptionAccess) {
      throw new CatalogServiceError('SUBSCRIPTION_REQUIRED');
    }
  }
}

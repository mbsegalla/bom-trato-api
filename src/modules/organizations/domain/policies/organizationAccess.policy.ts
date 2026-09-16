export interface OrganizationAccessContext {
  isMember: boolean;
  verified: boolean;
  hasSubscriptionAccess: boolean;
  billingNeedsReconciliation: boolean;
}

export type OrganizationAccessDenial =
  'MEMBER_REQUIRED' | 'VERIFIED_USER_REQUIRED' | 'BILLING_RECONCILIATION_REQUIRED' | 'SUBSCRIPTION_REQUIRED';

export class OrganizationAccessPolicy {
  static assertVerifiedMember(
    context: OrganizationAccessContext,
    error: (code: OrganizationAccessDenial) => Error,
  ): void {
    if (!context.isMember) {
      throw error('MEMBER_REQUIRED');
    }

    if (!context.verified) {
      throw error('VERIFIED_USER_REQUIRED');
    }
  }

  static assertCanOperate(context: OrganizationAccessContext, error: (code: OrganizationAccessDenial) => Error): void {
    this.assertVerifiedMember(context, error);

    if (context.billingNeedsReconciliation) {
      throw error('BILLING_RECONCILIATION_REQUIRED');
    }

    if (!context.hasSubscriptionAccess) {
      throw error('SUBSCRIPTION_REQUIRED');
    }
  }
}

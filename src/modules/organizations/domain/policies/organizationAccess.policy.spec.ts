import { describe, expect, it } from 'vitest';

import { OrganizationAccessPolicy } from './organizationAccess.policy.js';
import type { OrganizationAccessContext } from './organizationAccess.policy.js';

const allowed: OrganizationAccessContext = {
  isMember: true, verified: true, hasPlatformAccess: true, source: 'SUBSCRIPTION', billingNeedsReconciliation: false,
};
const error = (code: string) => new Error(code);

describe('OrganizationAccessPolicy', () => {
  it('rejects other organizations and unverified accounts even on historical reads', () => {
    expect(() => OrganizationAccessPolicy.assertVerifiedMember({ ...allowed, isMember: false }, error)).toThrow('MEMBER_REQUIRED');
    expect(() => OrganizationAccessPolicy.assertVerifiedMember({ ...allowed, verified: false }, error)).toThrow('VERIFIED_USER_REQUIRED');
  });

  it('allows historical reads but forbids mutations without active access', () => {
    const expired = { ...allowed, hasPlatformAccess: false, source: 'NONE' as const };
    expect(() => OrganizationAccessPolicy.assertVerifiedMember(expired, error)).not.toThrow();
    expect(() => OrganizationAccessPolicy.assertCanOperate(expired, error)).toThrow('SUBSCRIPTION_REQUIRED');
  });

  it('fails closed on billing reconciliation even with a subscription', () => {
    expect(() => OrganizationAccessPolicy.assertCanOperate({ ...allowed, billingNeedsReconciliation: true }, error)).toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(() => OrganizationAccessPolicy.assertCanOperate(allowed, error)).not.toThrow();
  });
});

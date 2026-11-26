import { describe, expect, it } from 'vitest';

import type { SubscriptionProps } from '../../../billing/domain/entities/subscription.entity.js';
import { OrganizationTrial } from '../entities/organizationTrial.entity.js';
import { OrganizationPlatformAccessPolicy } from './organizationPlatformAccess.policy.js';
import type { OrganizationPlatformAccessContext } from './organizationPlatformAccess.policy.js';

const now = new Date('2026-01-01T00:00:00Z');
const future = new Date(now.getTime() + 86_400_000);
const paid: SubscriptionProps = {
  id: 'subscription', organizationId: 'org', planPriceId: 'price', stripeSubscriptionId: 'sub_test',
  status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: future, paidThrough: future,
  cancelAtPeriodEnd: false, canceledAt: null, endedAt: null, stripeCreatedAt: now,
};
const trial = OrganizationTrial.create({ id: 'trial', organizationId: 'org', ownerId: 'owner', now }).snapshot();
const context: OrganizationPlatformAccessContext = {
  organizationId: 'org', subscriptions: [], trial, hasPaidSubscriptionHistory: false,
};

describe('OrganizationPlatformAccessPolicy', () => {
  it('uses paid access before trial and never grants access from another organization', () => {
    expect(OrganizationPlatformAccessPolicy.resolve({ ...context, subscriptions: [paid] }, now)).toEqual({
      hasAccess: true, source: 'SUBSCRIPTION', billingNeedsReconciliation: false,
    });
    expect(OrganizationPlatformAccessPolicy.resolve({ ...context, trial: null, subscriptions: [{ ...paid, organizationId: 'other' }] }, now).hasAccess).toBe(false);
  });

  it('fails closed when multiple ongoing subscriptions need reconciliation', () => {
    expect(OrganizationPlatformAccessPolicy.resolve({ ...context, subscriptions: [paid, { ...paid, id: 'second' }] }, now)).toEqual({
      hasAccess: false, source: 'NONE', billingNeedsReconciliation: true,
    });
  });

  it('does not reactivate trial for an organization with paid history', () => {
    expect(OrganizationPlatformAccessPolicy.resolve(context, now).source).toBe('TRIAL');
    expect(OrganizationPlatformAccessPolicy.resolve({ ...context, hasPaidSubscriptionHistory: true }, now).hasAccess).toBe(false);
    expect(OrganizationPlatformAccessPolicy.resolve({ ...context, subscriptions: [{ ...paid, status: 'CANCELED' }] }, now).hasAccess).toBe(false);
  });
});

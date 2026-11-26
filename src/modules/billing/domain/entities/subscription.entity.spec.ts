import { describe, expect, it } from 'vitest';

import type { SubscriptionProps } from './subscription.entity.js';
import { Subscription } from './subscription.entity.js';

const start = new Date('2026-01-01T00:00:00Z');
const end = new Date('2026-02-01T00:00:00Z');
const props: SubscriptionProps = {
  id: 'id',
  organizationId: 'org',
  planPriceId: 'price',
  stripeSubscriptionId: 'sub_fixture',
  status: 'ACTIVE',
  currentPeriodStart: start,
  currentPeriodEnd: end,
  paidThrough: end,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  endedAt: null,
  stripeCreatedAt: start,
};

describe('Subscription', () => {
  it.each(['ACTIVE', 'PAST_DUE'] as const)('allows only paid time for %s', (status) => {
    const subscription = Subscription.restore({ ...props, status });

    expect(subscription.hasAccessAt(start)).toBe(true);
    expect(subscription.hasAccessAt(end)).toBe(false);
    expect(Subscription.restore({ ...props, status, paidThrough: null }).hasAccessAt(start)).toBe(false);
  });

  it.each(['INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'CANCELED', 'UNPAID', 'PAUSED'] as const)(
    'denies paid access for %s',
    (status) => {
      expect(Subscription.restore({ ...props, status }).hasAccessAt(start)).toBe(false);
    },
  );

  it('does not allow ended subscriptions and omits Stripe identifiers from public views', () => {
    expect(Subscription.restore({ ...props, endedAt: start }).hasAccessAt(start)).toBe(false);
    expect(Subscription.restore(props).toPublic(start)).not.toHaveProperty('stripeSubscriptionId');
  });

  it('permits another checkout only for terminal checkout states', () => {
    expect(Subscription.blocksNewCheckout('CANCELED')).toBe(false);
    expect(Subscription.blocksNewCheckout('INCOMPLETE_EXPIRED')).toBe(false);
    expect(Subscription.blocksNewCheckout('INCOMPLETE')).toBe(true);
    expect(Subscription.blocksNewCheckout('ACTIVE')).toBe(true);
  });
});

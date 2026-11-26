import { describe, expect, it } from 'vitest';

import { PlanChange } from './planChange.entity.js';
import type { CreatePlanChangeParams, PlanChangePrice } from './planChange.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const periodStart = now.getTime() / 1000 - 86400;
const periodEnd = now.getTime() / 1000 + 86400;
const input: CreatePlanChangeParams = {
  id: 'change', organizationId: 'org', requestedById: 'owner', sourcePlanPriceId: 'first', targetPlanPriceId: 'second', targetMaxUsers: 3,
  stripeCustomerId: 'cus_fixture', stripeSubscriptionId: 'sub_fixture', stripeItemId: 'si_fixture', sourceStripePriceId: 'price_first', targetStripePriceId: 'price_second',
  mode: 'IMMEDIATE', currency: 'brl', amountDueNow: 1000, targetAmountInCents: 4990, targetInterval: 'MONTH', targetIntervalCount: 1,
  periodStart, periodEnd, prorationDate: now.getTime() / 1000, expiresAt: new Date(now.getTime() + 60000),
};
const source: PlanChangePrice = { level: 1, amountInCents: 2990, currency: 'brl', interval: 'MONTH', intervalCount: 1 };
describe('PlanChange', () => {
  it('applies only a genuine same-interval upgrade immediately', () => {
    const target = { ...source, level: 2, amountInCents: 4990 };
    expect(PlanChange.determineMode({ source, target })).toBe('IMMEDIATE');
    expect(PlanChange.determineMode({ source: target, target: source })).toBe('PERIOD_END');
    expect(PlanChange.determineMode({ source, target: { ...target, interval: 'YEAR' } })).toBe('PERIOD_END');
    expect(() => PlanChange.determineMode({ source, target: { ...target, currency: 'usd' } })).toThrow('PLAN_CHANGE_UNSUPPORTED');
  });
  it.each([{ targetPlanPriceId: 'first' }, { targetMaxUsers: 0 }, { amountDueNow: -1 }, { targetAmountInCents: 1.5 }, { expiresAt: now }, { prorationDate: periodEnd }])('rejects invalid quote parameters %j', (patch) => {
    expect(() => PlanChange.create({ ...input, ...patch })).toThrow();
  });
  it('checks organization, member limit and expiration before moving to processing', () => {
    const value = PlanChange.create(input);
    expect(() => value.assertBelongsTo('other')).toThrow('PLAN_CHANGE_NOT_FOUND');
    expect(() => value.assertFitsMemberLimit(4)).toThrow('PLAN_MEMBER_LIMIT');
    expect(() => value.confirm(input.expiresAt)).toThrow('PLAN_CHANGE_QUOTE_EXPIRED');
    value.confirm(now);
    expect(value.blocksAnotherChange()).toBe(true);
    expect(() => value.confirm(now)).toThrow('PLAN_CHANGE_CONFLICT');
    expect(() => value.markScheduled()).toThrow('PLAN_CHANGE_CONFLICT');
    value.markPaymentPending();
    value.markApplied();
    value.markApplied();
    expect(value.isTerminal()).toBe(true);
    expect(() => value.markCanceled()).toThrow('PLAN_CHANGE_CONFLICT');
  });
  it('permits a scheduled downgrade cancellation only before its effective date and masks Stripe identity', () => {
    const value = PlanChange.create({ ...input, mode: 'PERIOD_END' });
    value.confirm(now);
    value.markScheduled();
    expect(() => value.assertCanRequestCancellation(new Date(periodEnd * 1000 - 1))).not.toThrow();
    expect(() => value.assertCanRequestCancellation(new Date(periodEnd * 1000))).toThrow('PLAN_CHANGE_CONFLICT');
    expect(value.toPublic()).toMatchObject({ effectiveAt: new Date(periodEnd * 1000), status: 'SCHEDULED', clientSecret: null });
    expect(value.toPublic()).not.toHaveProperty('stripeSubscriptionId');
  });
});

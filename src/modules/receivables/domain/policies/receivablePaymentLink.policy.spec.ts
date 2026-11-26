import { describe, expect, it } from 'vitest';

import { isReceivablePaymentLinkCurrent, RECEIVABLE_PAYMENT_LINK_DURATION_MS } from './receivablePaymentLink.policy.js';

const now = new Date('2026-11-25T12:00:00.000Z');
const link = {
  createdById: 'owner',
  expiresAt: new Date(now.getTime() + RECEIVABLE_PAYMENT_LINK_DURATION_MS),
  revokedAt: null,
  receivableVersion: 2,
  receivingSettingsVersion: 3,
};
const context = { ownerId: 'owner', receivableVersion: 2, receivingSettingsVersion: 3 };

describe('receivable payment link policy', () => {
  it('accepts only the current unrevoked link within its lifetime', () => {
    expect(isReceivablePaymentLinkCurrent(link, context, now)).toBe(true);
    expect(isReceivablePaymentLinkCurrent(link, context, link.expiresAt)).toBe(false);
    expect(isReceivablePaymentLinkCurrent({ ...link, revokedAt: now }, context, now)).toBe(false);
  });

  it('invalidates links after owner, receivable or destination changes', () => {
    expect(isReceivablePaymentLinkCurrent(link, { ...context, ownerId: 'other' }, now)).toBe(false);
    expect(isReceivablePaymentLinkCurrent(link, { ...context, receivableVersion: 3 }, now)).toBe(false);
    expect(isReceivablePaymentLinkCurrent(link, { ...context, receivingSettingsVersion: 4 }, now)).toBe(false);
  });
});

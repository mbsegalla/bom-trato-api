import { describe, expect, it } from 'vitest';

import type { ReceivableProps } from '../entities/receivable.entity.js';
import type { VerifiedProviderPayment } from '../types/receivableProviderPayment.types.js';

import {
  assertProviderChargeRegistration,
  assertVerifiedProviderPayment,
  decideProviderPayment,
} from './receivableProviderPayment.policy.js';

const now = new Date('2026-11-25T15:00:00.000Z');
const receivable: ReceivableProps = {
  id: 'receivable',
  organizationId: 'organization',
  workOrderId: 'order',
  kind: 'FULL',
  customerId: 'customer',
  customerName: 'Cliente',
  title: 'Serviço',
  currency: 'brl',
  amountInCents: 50000,
  receivedInCents: 15000,
  status: 'PARTIALLY_PAID',
  dueAt: now,
  notes: null,
  canceledAt: null,
  canceledById: null,
  cancellationReason: null,
  version: 2,
  createdById: 'owner',
  updatedById: 'owner',
  createdAt: now,
  updatedAt: now,
};
const charge = {
  expectedAmountInCents: 35000,
  receivableVersion: 2,
  registeredById: 'owner',
  paymentId: null,
  reviewReason: null,
};
const payment: VerifiedProviderPayment = {
  provider: 'example-provider',
  externalAccountId: 'account-1',
  externalPaymentId: 'payment-1',
  liveMode: true,
  eventId: 'event-1',
  amountInCents: 35000,
  currency: 'brl',
  paidAt: now,
};

describe('provider payment confirmation policy', () => {
  it('accepts a verified payment for the exact remaining amount and registered version', () => {
    expect(decideProviderPayment(charge, receivable, 'owner', payment)).toEqual({ kind: 'APPLY' });
  });

  it('does not apply another event for an already linked payment, even after the version changes', () => {
    const paid = { ...receivable, status: 'PAID' as const, version: 3, receivedInCents: 50000 };
    const replay = { ...payment, eventId: 'event-2' };

    expect(decideProviderPayment({ ...charge, paymentId: 'recorded' }, paid, 'owner', replay)).toEqual({
      kind: 'DUPLICATE',
    });
  });

  it('sends unexpected currency and amount to review rather than changing a balance', () => {
    expect(decideProviderPayment(charge, receivable, 'owner', { ...payment, currency: 'usd' })).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'CURRENCY_MISMATCH',
    });
    expect(decideProviderPayment(charge, receivable, 'owner', { ...payment, amountInCents: 35001 })).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('does not apply after manual payments or other changes to the receivable', () => {
    const changed = { ...receivable, version: 3, receivedInCents: 20000 };

    expect(decideProviderPayment(charge, changed, 'owner', payment)).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'RECEIVABLE_CHANGED',
    });
  });

  it('does not apply after cancellation or ownership transfer', () => {
    expect(decideProviderPayment(charge, { ...receivable, status: 'CANCELED' }, 'owner', payment)).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'RECEIVABLE_INELIGIBLE',
    });
    expect(decideProviderPayment(charge, receivable, 'new-owner', payment)).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'OWNER_CHANGED',
    });
  });

  it('keeps a previously flagged payment in review even if a later event matches', () => {
    const flagged = { ...charge, reviewReason: 'AMOUNT_MISMATCH' as const };

    expect(decideProviderPayment(flagged, receivable, 'owner', payment)).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('rejects malformed references, amounts, event IDs and future timestamps', () => {
    expect(() => assertVerifiedProviderPayment(payment, now)).not.toThrow();
    expect(() => assertVerifiedProviderPayment({ ...payment, externalAccountId: '' }, now)).toThrow();
    expect(() => assertVerifiedProviderPayment({ ...payment, amountInCents: 0 }, now)).toThrow();
    expect(() => assertVerifiedProviderPayment({ ...payment, eventId: 'a'.repeat(201) }, now)).toThrow();
    expect(() => assertVerifiedProviderPayment({ ...payment, paidAt: new Date(now.getTime() + 1) }, now)).toThrow();
  });

  it('validates the registration snapshot', () => {
    const registration = { ...payment, expectedAmountInCents: 35000, receivableVersion: 2 };

    expect(() => assertProviderChargeRegistration(registration)).not.toThrow();
    expect(() => assertProviderChargeRegistration({ ...registration, receivableVersion: 0 })).toThrow();
    expect(() => assertProviderChargeRegistration({ ...registration, provider: 'BAD' })).toThrow();
  });
});

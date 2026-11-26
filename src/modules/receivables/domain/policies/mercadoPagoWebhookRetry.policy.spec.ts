import { describe, expect, it } from 'vitest';

import { mercadoPagoWebhookDisposition, mercadoPagoWebhookRetryDelaySeconds } from './mercadoPagoWebhookRetry.policy.js';
const binding = { issuanceId: 'issuance', organizationId: 'org', ownerId: 'owner', clientId: 'client', accountId: 'seller', paymentId: 'payment', amountInCents: 100 };
describe('Mercado Pago webhook retry policy', () => {
  it('backs off exponentially and caps the delay at one hour', () => {
    expect([0, 1, 2, 3, 6, 7, 24].map(mercadoPagoWebhookRetryDelaySeconds)).toEqual([30, 60, 120, 240, 1920, 3600, 3600]);
  });
  it('retains unknown events until the final attempt and never silently completes a review', () => {
    const outcome = { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' } as const;
    expect(mercadoPagoWebhookDisposition(outcome, 23)).toMatchObject({ complete: false, review: false, matchedIssuanceId: null });
    expect(mercadoPagoWebhookDisposition(outcome, 24)).toMatchObject({ complete: false, review: true });
    expect(mercadoPagoWebhookDisposition({ kind: 'REVIEW', code: 'AMBIGUOUS_PAYMENT' }, 0)).toMatchObject({ complete: false, review: true });
  });
  it.each([['PENDING', true], ['APPROVED', true], ['CLOSED', true], ['REFUNDED', false], ['REVIEW_REQUIRED', false]] as const)('classifies verified %s with the original issuance', (status, complete) => {
    expect(mercadoPagoWebhookDisposition({ kind: 'CHECKED', binding, connectedAt: new Date(0), status }, 0)).toEqual({
      complete, review: !complete, code: 'VERIFIED_' + status, matchedIssuanceId: 'issuance',
    });
  });
});

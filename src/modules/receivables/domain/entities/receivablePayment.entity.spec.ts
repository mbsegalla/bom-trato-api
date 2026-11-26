import { describe, expect, it } from 'vitest';

import { ReceivablePayment } from './receivablePayment.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input = { id: 'payment', receivableId: 'receivable', requestId: 'request', amountInCents: 100, method: 'PIX' as const, receivedAt: now, recordedById: 'owner' };

describe('ReceivablePayment', () => {
  it('rejects future payment dates and invalid amount', () => {
    expect(() => ReceivablePayment.create({ ...input, receivedAt: new Date(now.getTime() + 1) }, now)).toThrow('INVALID_PAYMENT_DATE');
    expect(() => ReceivablePayment.create({ ...input, amountInCents: 0 }, now)).toThrow('INVALID_RECEIVABLE_AMOUNT');
  });

  it('matches an idempotent request only when its financial content agrees', () => {
    const payment = ReceivablePayment.create(input, now);
    expect(payment.matchesRequest(ReceivablePayment.create({ ...input, id: 'retry' }, now))).toBe(true);
    expect(payment.matchesRequest(ReceivablePayment.create({ ...input, amountInCents: 101 }, now))).toBe(false);
    expect(payment.matchesRequest(ReceivablePayment.create({ ...input, recordedById: 'other' }, now))).toBe(false);
  });
});

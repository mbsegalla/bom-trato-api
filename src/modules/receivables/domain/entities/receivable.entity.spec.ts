import { describe, expect, it } from 'vitest';

import { Receivable } from './receivable.entity.js';
import { ReceivablePayment } from './receivablePayment.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input = {
  id: 'receivable', organizationId: 'org', userId: 'owner', kind: 'FULL' as const, amountInCents: 10000, dueAt: now,
  source: { id: 'work-order', organizationId: 'org', customerId: 'customer', customerName: 'Cliente', title: 'Servico', currency: 'brl', totalInCents: 10000, status: 'COMPLETED' as const },
};
const payment = (amountInCents: number, id = 'payment', receivableId = 'receivable') =>
  ReceivablePayment.create({ id, receivableId, requestId: id, amountInCents, method: 'PIX', receivedAt: now, recordedById: 'owner' }, now);

describe('Receivable', () => {
  it('rejects cross-organization sources and amounts exceeding the work order', () => {
    expect(() => Receivable.create({ ...input, organizationId: 'other' }, now)).toThrow('WORK_ORDER_NOT_FOUND');
    expect(() => Receivable.create({ ...input, amountInCents: 10001 }, now)).toThrow('INVALID_RECEIVABLE_INPUT');
  });

  it('tracks partial, full and reversed payments without losing cents', () => {
    const receivable = Receivable.create(input, now);
    const first = payment(3001);
    const second = payment(6999, 'second');
    receivable.receive(first);
    expect(receivable.view(now)).toMatchObject({ status: 'PARTIALLY_PAID', balanceInCents: 6999 });
    receivable.receive(second);
    expect(receivable.view(now)).toMatchObject({ status: 'PAID', balanceInCents: 0 });
    receivable.reversePayment(second, 'owner', 'Refund requested', now);
    expect(receivable.view(now)).toMatchObject({ status: 'PARTIALLY_PAID', balanceInCents: 6999 });
    expect(() => receivable.reversePayment(second, 'owner', 'Duplicate refund', now)).toThrow('PAYMENT_ALREADY_REVERSED');
    receivable.reversePayment(first, 'owner', 'Refund requested', now);
    expect(receivable.view(now)).toMatchObject({ status: 'OPEN', balanceInCents: 10000 });
  });

  it('rejects wrong receivable, overpayment and cancellation while paid', () => {
    const receivable = Receivable.create(input, now);
    expect(() => receivable.receive(payment(100, 'other', 'different'))).toThrow('PAYMENT_NOT_FOUND');
    expect(() => receivable.receive(payment(10001))).toThrow('PAYMENT_EXCEEDS_BALANCE');
    receivable.receive(payment(1));
    expect(() => receivable.cancel('owner', 'Canceled', now)).toThrow('RECEIVABLE_HAS_PAYMENTS');
    expect(receivable.snapshot().receivedInCents).toBe(1);
  });

  it('keeps canceled receivables closed and guards optimistic concurrency', () => {
    const receivable = Receivable.create(input, now);
    receivable.recordChange('owner', now);
    expect(() => receivable.assertVersion(1)).toThrow('RECEIVABLE_VERSION_CONFLICT');
    receivable.cancel('owner', 'Canceled', now);
    expect(receivable.view(new Date(now.getTime() + 1000))).toMatchObject({ status: 'CANCELED', balanceInCents: 0, overdue: false });
    expect(() => receivable.receive(payment(100))).toThrow('RECEIVABLE_NOT_EDITABLE');
  });
});

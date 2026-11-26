import { describe, expect, it, vi } from 'vitest';

import type { ReceivableRepository } from '../../domain/repositories/receivable.repository.js';
import { ensureFinalReceivableFromQuote, ensureInitialReceivableFromQuote } from './receivableAutomation.service.js';

const now = new Date('2026-01-01T00:00:00Z');
const dueAt = new Date('2026-01-08T00:00:00Z');
const source = { id: 'order', organizationId: 'org', customerId: 'customer', customerName: 'Fixture', title: 'Fixture service', totalInCents: 10001, currency: 'brl', status: 'COMPLETED' as const };
const base = { organizationId: 'org', userId: 'owner', source, now };
function fixture() {
  const receivables = {
    create: vi.fn<ReceivableRepository['create']>().mockResolvedValue(undefined),
    findByWorkOrderIdAndKind: vi.fn<ReceivableRepository['findByWorkOrderIdAndKind']>().mockResolvedValue(null),
  };
  return { receivables, params: { ...base, receivables } };
}

describe('receivable automation', () => {
  it('splits a fractional down payment without creating or losing cents', async () => {
    const f = fixture();
    const quote = { paymentCondition: 'DOWN_PAYMENT_AND_BALANCE' as const, downPaymentPercentage: 50, totalInCents: 10001 };
    const initial = await ensureInitialReceivableFromQuote({ ...f.params, quote });
    const final = await ensureFinalReceivableFromQuote({ ...f.params, quote, dueAt });
    expect(initial).toMatchObject({ kind: 'DOWN_PAYMENT', amountInCents: 5001, dueAt: now });
    expect(final).toMatchObject({ kind: 'REMAINING_BALANCE', amountInCents: 5000, dueAt });
    expect(initial!.amountInCents + final!.amountInCents).toBe(quote.totalInCents);
  });

  it.each([['UPFRONT', 'initial'], ['AFTER_COMPLETION', 'final']] as const)(
    'issues only one full receivable at the correct stage for %s', async (paymentCondition, stage) => {
      const f = fixture();
      const quote = { paymentCondition, downPaymentPercentage: null, totalInCents: source.totalInCents };
      const initial = await ensureInitialReceivableFromQuote({ ...f.params, quote });
      const final = await ensureFinalReceivableFromQuote({ ...f.params, quote, dueAt });
      expect(stage === 'initial' ? initial : final).toMatchObject({ kind: 'FULL', amountInCents: 10001 });
      expect(stage === 'initial' ? final : initial).toBeNull();
      expect(f.receivables.create).toHaveBeenCalledTimes(1);
    },
  );

  it('reuses the original receivable when the same order and kind are already registered', async () => {
    const f = fixture();
    const quote = { paymentCondition: 'UPFRONT' as const, downPaymentPercentage: null, totalInCents: 10001 };
    const first = await ensureInitialReceivableFromQuote({ ...f.params, quote });
    f.receivables.findByWorkOrderIdAndKind.mockResolvedValueOnce(f.receivables.create.mock.calls[0]![0].snapshot());
    expect(await ensureInitialReceivableFromQuote({ ...f.params, quote })).toEqual(first);
    expect(f.receivables.create).toHaveBeenCalledTimes(1);
  });

  it.each([null, 0, 100, 50.5])('rejects invalid split percentage %s without writing', async (downPaymentPercentage) => {
    const f = fixture();
    const quote = { paymentCondition: 'DOWN_PAYMENT_AND_BALANCE' as const, downPaymentPercentage, totalInCents: 10001 };
    await expect(ensureInitialReceivableFromQuote({ ...f.params, quote })).rejects.toThrow('INVALID_RECEIVABLE_INPUT');
    await expect(ensureFinalReceivableFromQuote({ ...f.params, quote, dueAt })).rejects.toThrow('INVALID_RECEIVABLE_INPUT');
    expect(f.receivables.create).not.toHaveBeenCalled();
  });

  it('refuses mismatched financial snapshots and skips zero-total quotes', async () => {
    const f = fixture();
    const quote = { paymentCondition: 'UPFRONT' as const, downPaymentPercentage: null, totalInCents: 0 };
    await expect(ensureInitialReceivableFromQuote({ ...f.params, quote })).rejects.toThrow('INVALID_RECEIVABLE_INPUT');
    expect(await ensureInitialReceivableFromQuote({ ...f.params, quote, source: { ...source, totalInCents: 0 } })).toBeNull();
    expect(await ensureFinalReceivableFromQuote({ ...f.params, quote, dueAt, source: { ...source, totalInCents: 0 } })).toBeNull();
    expect(f.receivables.create).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

import { PublicWorkOrderFinancialPolicy } from './publicWorkOrderFinancial.policy.js';

const input = {
  currency: 'brl',
  totalInCents: 10001,
  status: 'IN_PROGRESS' as const,
  receivables: [
    {
      currency: 'brl',
      amountInCents: 5001,
      receivedInCents: 3000,
      status: 'PARTIALLY_PAID' as const
    },
    {
      currency: 'brl',
      amountInCents: 9999,
      receivedInCents: 0,
      status: 'CANCELED' as const
    },
  ]
};

describe('PublicWorkOrderFinancialPolicy', () => {
  it('distinguishes outstanding issued receivables from the remaining contract and excludes canceled amounts', () => {
    expect(PublicWorkOrderFinancialPolicy.resolve(input)).toEqual({
      receivedInCents: 3000,
      remainingContractInCents: 7001,
      outstandingReceivablesInCents: 2001,
    });
    expect(PublicWorkOrderFinancialPolicy.resolve({ ...input, status: 'CANCELED' })).toMatchObject({ remainingContractInCents: null });
  });

  it('fails closed on mismatched currency, over-allocation, overpayment and invalid cents', () => {
    const first = input.receivables[0]!;
    for (const patch of [
      { currency: 'usd' },
      { amountInCents: 10002 },
      { receivedInCents: 5002 },
      { amountInCents: 1.5 },
      { receivedInCents: -1 }
    ]) {
      expect(PublicWorkOrderFinancialPolicy.resolve({ ...input, receivables: [{ ...first, ...patch }] })).toBeNull();
    }
  });
});

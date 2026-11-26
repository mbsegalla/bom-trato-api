import { describe, expect, it } from 'vitest';

import { QuoteItem } from './quoteItem.entity.js';

const input = {
  name: 'Servico',
  unit: 'SERVICE' as const,
  quantity: '1.005',
  unitAmountInCents: 100,
};

describe('QuoteItem', () => {
  it('calculates fractional quantities using integer arithmetic and half-up rounding', () => {
    expect(QuoteItem.create('item', input).snapshot()).toMatchObject({
      quantityInThousandths: 1005,
      totalInCents: 101,
    });
    expect(
      QuoteItem.create('item', {
        ...input,
        quantity: '0.001',
        unitAmountInCents: 499,
      }).snapshot().totalInCents,
    ).toBe(0);
  });

  it.each(['0', '-1', '1.0001', '1e3', '1,5'])('rejects invalid quantity %s', (quantity) => {
    expect(() => QuoteItem.create('item', { ...input, quantity })).toThrow('INVALID_QUOTE_ITEM');
  });

  it('rejects total overflow and fractional cent prices', () => {
    expect(() =>
      QuoteItem.create('item', {
        ...input,
        quantity: '2',
        unitAmountInCents: 2147483647,
      }),
    ).toThrow('INVALID_QUOTE_AMOUNT');
    expect(() => QuoteItem.create('item', { ...input, unitAmountInCents: 1.5 })).toThrow('INVALID_QUOTE_AMOUNT');
  });
});

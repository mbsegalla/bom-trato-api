import { describe, expect, it } from 'vitest';

import { Quote } from './quote.entity.js';
import { QuoteItem } from './quoteItem.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const expiresAt = new Date(now.getTime() + 86_400_000);
const create = () => Quote.create({
  id: 'quote',
  organizationId: 'org',
  userId: 'owner',
  customer: {
    id: 'customer',
    name: 'Cliente',
    email: null,
    phone: null
  },
  details: { title: 'Servico', validUntil: expiresAt },
}, now);
const item = () => QuoteItem.create('item', {
  name: 'Servico',
  unit: 'SERVICE',
  quantity: '2.5',
  unitAmountInCents: 1000
});

describe('Quote', () => {
  it('maintains integer totals and rejects a discount beyond the subtotal without mutating state', () => {
    const quote = create();
    quote.addItem(item());
    quote.update({ discountInCents: 500 }, now);

    expect(quote.snapshot()).toMatchObject({ subtotalInCents: 2500, totalInCents: 2000 });
    expect(() => quote.update({ discountInCents: 2501 }, now)).toThrow('INVALID_QUOTE_DISCOUNT');
    expect(quote.snapshot().totalInCents).toBe(2000);
  });

  it('cannot send an empty quote, approve a draft, or edit after sending', () => {
    const quote = create();

    expect(() => quote.approve(now)).toThrow('INVALID_QUOTE_TRANSITION');
    expect(() => quote.markSent(now)).toThrow('QUOTE_EMPTY');

    quote.addItem(item());
    quote.markSent(now);

    expect(() => quote.update({ title: 'Changed' }, now)).toThrow('QUOTE_NOT_EDITABLE');

    quote.approve(now);

    expect(quote.snapshot().status).toBe('APPROVED');
    expect(() => quote.cancel(now)).toThrow('INVALID_QUOTE_TRANSITION');
  });

  it('rejects expired decisions and stale versions', () => {
    const quote = create();
    quote.addItem(item());
    quote.markSent(now);

    expect(() => quote.approve(expiresAt)).toThrow('QUOTE_EXPIRED');

    quote.recordChange('owner', now);

    expect(() => quote.assertVersion(1)).toThrow('QUOTE_VERSION_CONFLICT');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { Quote } from './quote.entity.js';
import { QuoteItem } from './quoteItem.entity.js';
import { QuoteShare } from './quoteShare.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const expiresAt = new Date(now.getTime() + 86400000);
function fixture() {
  const quote = Quote.create({ id: 'quote', organizationId: 'org', userId: 'owner', customer: { id: 'customer', name: 'Cliente', email: null, phone: null }, details: { title: 'Servico' } }, now);
  quote.addItem(QuoteItem.create('item', { name: 'Servico', unit: 'SERVICE', quantity: '1', unitAmountInCents: 1000 }));
  quote.markSent(now);
  const share = QuoteShare.create({ id: 'share', tokenHash: 'hash', userId: 'owner', expiresAt }, quote, now);
  return { quote, share };
}
describe('QuoteShare', () => {
  it('allows the original decision exactly once and rejects conflicting replay', () => {
    const { quote, share } = fixture();
    expect(share.decide(quote, 'APPROVED', 1, now)).toBe(true);
    expect(share.decide(quote, 'APPROVED', 1, now)).toBe(false);
    expect(quote.snapshot()).toMatchObject({ status: 'APPROVED', version: 2 });
    expect(() => share.decide(quote, 'DECLINED', 1, now)).toThrow('QUOTE_SHARE_ALREADY_DECIDED');
  });
  it('fails closed on expired, revoked, stale and cross-organization links', () => {
    const { quote, share } = fixture();
    expect(() => share.assertReadable(quote, expiresAt)).toThrow('QUOTE_SHARE_NOT_FOUND');
    expect(() => QuoteShare.restore({ ...share.snapshot(), revokedAt: now }).assertReadable(quote, now)).toThrow('QUOTE_SHARE_NOT_FOUND');
    expect(() => QuoteShare.restore({ ...share.snapshot(), organizationId: 'other' }).assertReadable(quote, now)).toThrow('QUOTE_SHARE_NOT_FOUND');
    quote.recordChange('owner', now);
    expect(() => share.assertReadable(quote, now)).toThrow('QUOTE_VERSION_CONFLICT');
  });
  it('keeps the original requested change and forbids a later approval on the same share', () => {
    const { quote, share } = fixture();
    expect(share.requestChange(quote, 1, ' Alterar data ', now)).toBe(true);
    expect(share.requestChange(quote, 1, 'Another request', now)).toBe(false);
    expect(share.snapshot().changeRequestMessage).toBe('Alterar data');
    expect(() => share.decide(quote, 'APPROVED', 1, now)).toThrow('QUOTE_SHARE_CHANGE_ALREADY_REQUESTED');
    expect(quote.snapshot().status).toBe('SENT');
  });
});

import { describe, expect, it } from 'vitest';

import { Quote } from '../../../quotes/domain/entities/quote.entity.js';
import { QuoteItem } from '../../../quotes/domain/entities/quoteItem.entity.js';
import { WorkOrder } from './workOrder.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
function quote() {
  const value = Quote.create({ id: 'quote', organizationId: 'org', userId: 'owner', customer: { id: 'customer', name: 'Cliente', email: null, phone: null }, details: { title: 'Servico' } }, now);
  value.addItem(QuoteItem.create('quote-item', { name: 'Servico', unit: 'SERVICE', quantity: '1', unitAmountInCents: 1000 }));
  return value;
}
function order() {
  const value = quote();
  value.markSent(now);
  value.approve(now);
  return WorkOrder.create({ id: 'order', organizationId: 'org', userId: 'owner', quote: value.snapshot(), itemIds: ['item'] }, now);
}

describe('WorkOrder', () => {
  it('requires an approved quote from the same organization', () => {
    expect(() => WorkOrder.create({ id: 'order', organizationId: 'org', userId: 'owner', quote: quote().snapshot(), itemIds: ['item'] }, now)).toThrow('QUOTE_NOT_APPROVED');
    const original = order().snapshot();
    expect(original).toMatchObject({ totalInCents: 1000, status: 'OPEN', items: [{ sourceQuoteItemId: 'quote-item' }] });
  });

  it('requires assignment and address before starting and cannot complete a draft order', () => {
    const value = order();
    expect(() => value.complete(now)).toThrow('INVALID_WORK_ORDER_TRANSITION');
    expect(() => value.start(now)).toThrow('ASSIGNEE_REQUIRED');
    value.assign('worker');
    expect(() => value.start(now)).toThrow('SERVICE_ADDRESS_REQUIRED');
    value.update({ serviceAddress: 'Rua de teste' });
    value.start(now);
    value.complete(now);
    expect(value.snapshot().status).toBe('COMPLETED');
    expect(() => value.cancel('Canceled order', now)).toThrow('INVALID_WORK_ORDER_TRANSITION');
  });

  it('rejects invalid scheduling and stale versions', () => {
    const value = order();
    value.assign('worker');
    value.update({ serviceAddress: 'Rua de teste' });
    expect(() => value.schedule(now, new Date(now.getTime() + 1000), now)).toThrow('INVALID_WORK_ORDER_SCHEDULE');
    value.recordChange('owner', now);
    expect(() => value.assertVersion(1)).toThrow('WORK_ORDER_VERSION_CONFLICT');
  });
});

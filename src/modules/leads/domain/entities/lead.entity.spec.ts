import { describe, expect, it } from 'vitest';

import { Lead } from './lead.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input = {
  id: 'lead',
  requestKey: 'request',
  organizationId: 'org',
  publicBusinessProfileId: 'profile',
  catalogServiceId: null,
  requestedServiceName: null,
  name: 'Cliente',
  email: 'client@example.invalid',
  message: 'Preciso de uma revisao',
};

describe('Lead', () => {
  it('requires a contact channel and useful message', () => {
    expect(() => Lead.create({ ...input, email: null }, now)).toThrow('LEAD_CONTACT_REQUIRED');
    expect(() => Lead.create({ ...input, message: 'oi' }, now)).toThrow('INVALID_LEAD_MESSAGE');
  });

  it('preserves conversion identity and prevents reconversion or archival', () => {
    const lead = Lead.create(input, now);
    lead.markContacted(now);
    lead.convert('customer', 'quote', now);

    expect(lead.snapshot()).toMatchObject({
      status: 'CONVERTED',
      convertedCustomerId: 'customer',
      convertedQuoteId: 'quote'
    });
    expect(() => lead.convert('other', 'other', now)).toThrow('INVALID_LEAD_TRANSITION');
    expect(() => lead.archive(now)).toThrow('INVALID_LEAD_TRANSITION');
  });

  it('cannot contact an archived lead', () => {
    const lead = Lead.create(input, now);
    lead.archive(now);

    expect(() => lead.markContacted(now)).toThrow('INVALID_LEAD_TRANSITION');
    expect(() => lead.convert('customer', 'quote', now)).toThrow('INVALID_LEAD_TRANSITION');
  });
});

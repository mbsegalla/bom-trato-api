import { describe, expect, it, vi } from 'vitest';

import { Customer } from '../../../customers/domain/entities/customer.entity.js';
import type { CustomerRepository } from '../../../customers/domain/repositories/customer.repository.js';
import type { QuoteRepository } from '../../../quotes/domain/repositories/quote.repository.js';
import { Lead } from '../../domain/entities/lead.entity.js';
import type { LeadRepository } from '../../domain/repositories/lead.repository.js';
import type { LeadTransaction, LeadUnitOfWork } from '../ports/leadUnitOfWork.port.js';
import { LeadApplicationService } from '../services/leadApplicationService.service.js';

import { ConvertLeadUseCase } from './convertLead.useCase.js';

const actor = { organizationId: 'org', userId: 'owner', leadId: 'lead' };
const now = new Date('2026-01-01T00:00:00Z');
function fixture() {
  const state = Lead.create(
    {
      id: 'lead',
      organizationId: 'org',
      publicBusinessProfileId: 'profile',
      requestKey: 'request',
      catalogServiceId: 'catalog',
      requestedServiceName: 'Fixture service',
      name: 'Fixture customer',
      email: 'client@example.invalid',
      message: 'Preciso de uma revisao',
    },
    now,
  ).snapshot();
  const customer = Customer.create(
    {
      id: 'existing',
      organizationId: 'org',
      name: state.name,
      email: state.email,
    },
    now,
  ).snapshot();
  const leads = {
    findById: vi.fn<LeadRepository['findById']>().mockResolvedValue(state),
    save: vi.fn<LeadRepository['save']>().mockResolvedValue(undefined),
  };
  const customers = { create: vi.fn<CustomerRepository['create']>().mockResolvedValue(undefined) };
  const quotes = { create: vi.fn<QuoteRepository['create']>().mockResolvedValue(undefined) };
  const findCustomersByContact = vi.fn<LeadTransaction['findCustomersByContact']>().mockResolvedValue([]);
  const findCatalogService = vi.fn<LeadTransaction['findCatalogService']>().mockResolvedValue({
    id: 'catalog',
    name: 'Fixture service',
    description: null,
    unit: 'SERVICE',
    amountInCents: 1234,
    currency: 'brl',
    archivedAt: null,
  });
  const tx = {
    access: {
      isMember: true,
      verified: true,
      hasPlatformAccess: true,
      source: 'TRIAL',
      billingNeedsReconciliation: false,
    },
    leads,
    customers,
    quotes,
    findCustomersByContact,
    findCatalogService,
  } as unknown as LeadTransaction;
  const run = vi.fn(async (_actor: typeof actor, operation: (context: LeadTransaction) => Promise<unknown>) =>
    operation(tx),
  );

  return {
    state,
    customer,
    leads,
    customers,
    quotes,
    findCustomersByContact,
    findCatalogService,
    useCase: new ConvertLeadUseCase(new LeadApplicationService({ run } as unknown as LeadUnitOfWork)),
  };
}

describe('ConvertLeadUseCase', () => {
  it('creates one customer and a scoped draft quote with the current catalog price', async () => {
    const f = fixture();

    const result = await f.useCase.execute(actor);

    expect(result.lead).toMatchObject({
      status: 'CONVERTED',
      convertedCustomerId: result.customerId,
      convertedQuoteId: result.quoteId,
    });
    expect(f.customers.create.mock.calls[0][0].snapshot()).toMatchObject({
      id: result.customerId,
      organizationId: 'org',
      email: 'client@example.invalid',
    });
    expect(f.quotes.create.mock.calls[0][0].snapshot()).toMatchObject({
      id: result.quoteId,
      customerId: result.customerId,
      status: 'DRAFT',
      totalInCents: 1234,
    });
  });

  it('reuses an existing customer and never quotes a hidden or archived catalog service', async () => {
    const f = fixture();
    f.findCustomersByContact.mockResolvedValueOnce([f.customer]);
    f.findCatalogService.mockResolvedValueOnce(null);

    const result = await f.useCase.execute(actor);

    expect(result.customerId).toBe(f.customer.id);
    expect(f.customers.create).not.toHaveBeenCalled();
    expect(f.quotes.create.mock.calls[0][0].snapshot().totalInCents).toBe(0);
  });

  it('rejects ambiguous contacts and archived customers without creating anything', async () => {
    const f = fixture();
    f.findCustomersByContact.mockResolvedValueOnce([f.customer, { ...f.customer, id: 'other' }]);

    await expect(f.useCase.execute(actor)).rejects.toThrow('LEAD_CUSTOMER_CONFLICT');

    f.findCustomersByContact.mockResolvedValueOnce([{ ...f.customer, archivedAt: now }]);

    await expect(f.useCase.execute(actor)).rejects.toThrow('LEAD_CUSTOMER_ARCHIVED');
    expect(f.customers.create).not.toHaveBeenCalled();
    expect(f.quotes.create).not.toHaveBeenCalled();
    expect(f.leads.save).not.toHaveBeenCalled();
  });
});

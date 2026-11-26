import { describe, expect, it, vi } from 'vitest';

import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { ReceivableRepository } from '../../../receivables/domain/repositories/receivable.repository.js';
import type { WorkOrderRepository } from '../../../workOrders/domain/repositories/workOrder.repository.js';
import { Quote } from '../../domain/entities/quote.entity.js';
import { QuoteItem } from '../../domain/entities/quoteItem.entity.js';
import type { QuoteRepository } from '../../domain/repositories/quote.repository.js';
import type { QuoteTransaction, QuoteUnitOfWork } from '../ports/quoteUnitOfWork.port.js';
import { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import { AddQuoteItemUseCase } from './addQuoteItem.useCase.js';
import { ApproveQuoteUseCase } from './approveQuote.useCase.js';
import { CancelQuoteUseCase } from './cancelQuote.useCase.js';
import { CreateQuoteUseCase } from './createQuote.useCase.js';
import { DeclineQuoteUseCase } from './declineQuote.useCase.js';
import { SendQuoteUseCase } from './sendQuote.useCase.js';
import { UpdateQuoteUseCase } from './updateQuote.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };
const params = { ...actor, quoteId: 'quote', version: 1 };
const customer = {
  id: 'customer',
  name: 'Fixture customer',
  email: 'customer@example.invalid',
  phone: null,
  archivedAt: null
};
const access: OrganizationAccessContext = {
  isMember: true,
  verified: true,
  hasPlatformAccess: true,
  source: 'TRIAL',
  billingNeedsReconciliation: false,
};
const now = new Date('2026-01-01T00:00:00Z');
function quote() {
  const value = Quote.create({
    id: params.quoteId,
    ...actor,
    customer,
    details: {
      title: 'Fixture service',
      paymentCondition: 'DOWN_PAYMENT_AND_BALANCE',
      downPaymentPercentage: 25
    },
  }, now);
  value.addItem(QuoteItem.create('item', {
    name: 'Fixture service',
    unit: 'SERVICE',
    quantity: '1',
    unitAmountInCents: 10001
  }));

  return value;
}
function fixture(state = quote(), permissions = access) {
  const quotes = {
    findById: vi.fn<QuoteRepository['findById']>().mockResolvedValue(state.snapshot()),
    create: vi.fn<QuoteRepository['create']>().mockResolvedValue(undefined),
    save: vi.fn<QuoteRepository['save']>().mockResolvedValue(undefined),
  };
  const workOrders = {
    findByQuoteId: vi.fn<WorkOrderRepository['findByQuoteId']>().mockResolvedValue(null),
    create: vi.fn<WorkOrderRepository['create']>().mockResolvedValue(undefined),
  };
  const receivables = {
    findByWorkOrderIdAndKind: vi.fn<ReceivableRepository['findByWorkOrderIdAndKind']>().mockResolvedValue(null),
    create: vi.fn<ReceivableRepository['create']>().mockResolvedValue(undefined),
  };
  const findCustomer = vi.fn<QuoteTransaction['findCustomer']>().mockResolvedValue(customer);
  const findCatalogService = vi.fn<QuoteTransaction['findCatalogService']>().mockResolvedValue({
    id: 'catalog',
    name: 'Catalog service',
    description: null,
    unit: 'SERVICE',
    amountInCents: 3000,
    currency: 'brl',
    archivedAt: null,
  });
  const tx = {
    access: permissions,
    quotes,
    workOrders,
    receivables,
    findCustomer,
    findCatalogService,
    findSingleAssignableMember: vi.fn().mockResolvedValue('worker'),
    findCustomerDefaultServiceAddress: vi.fn().mockResolvedValue('Rua de teste'),
  } as unknown as QuoteTransaction;
  const run = vi.fn(async (_actor: typeof actor, operation: (context: QuoteTransaction) => Promise<unknown>) => operation(tx));

  return {
    quotes,
    workOrders,
    receivables,
    findCustomer,
    findCatalogService,
    run,
    service: new QuoteApplicationService({ run } as unknown as QuoteUnitOfWork)
  };
}

describe('quote lifecycle use cases', () => {
  it('creates a draft with the scoped customer and rejects an unavailable or archived customer', async () => {
    const f = fixture();
    const useCase = new CreateQuoteUseCase(f.service);

    const result = await useCase.execute(actor, { title: 'New quote', customerId: 'customer' });

    expect(result).toMatchObject({
      organizationId: actor.organizationId,
      customerId: customer.id,
      status: 'DRAFT',
      version: 1,
      totalInCents: 0
    });
    expect(f.findCustomer).toHaveBeenCalledWith('customer');

    f.findCustomer.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...customer, archivedAt: now });

    await expect(useCase.execute(actor, {
      title: 'New quote',
      customerId: 'other'
    })).rejects.toThrow('CUSTOMER_NOT_FOUND');
    await expect(useCase.execute(actor, {
      title: 'New quote',
      customerId: 'customer'
    })).rejects.toThrow('CUSTOMER_ARCHIVED');
    expect(f.quotes.create).toHaveBeenCalledTimes(1);
  });

  it('copies the catalog price rather than accepting a caller-supplied price, with integer totals', async () => {
    const f = fixture();

    const result = await new AddQuoteItemUseCase(f.service).execute(params, {
      catalogServiceId: 'catalog',
      quantity: '1.5'
    });

    expect(result).toMatchObject({ totalInCents: 14501, version: 2 });
    expect(result.items[1]).toMatchObject({
      name: 'Catalog service',
      unitAmountInCents: 3000,
      totalInCents: 4500
    });
    expect(f.quotes.save).toHaveBeenCalledWith(expect.any(Quote), 1);
  });

  it('rejects ambiguous item sources, missing catalog services and stale updates without saving', async () => {
    const f = fixture();
    const add = new AddQuoteItemUseCase(f.service);

    await expect(add.execute(
      params,
      {
        quantity: '1',
        catalogServiceId: 'catalog',
        custom: {
          name: 'Custom service',
          unit: 'SERVICE',
          unitAmountInCents: 1
        }
      }
    )).rejects.toThrow('INVALID_QUOTE_ITEM');

    f.findCatalogService.mockResolvedValueOnce(null);

    await expect(add.execute(params, {
      quantity: '1',
      catalogServiceId: 'missing'
    })).rejects.toThrow('CATALOG_SERVICE_NOT_FOUND');
    await expect(new UpdateQuoteUseCase(f.service).execute({ ...params, version: 2 }, { title: 'New title' })).rejects.toThrow('QUOTE_VERSION_CONFLICT');
    expect(f.quotes.save).not.toHaveBeenCalled();
  });

  it('rechecks the customer before sending and updates the version only after a valid transition', async () => {
    const f = fixture();
    const useCase = new SendQuoteUseCase(f.service);
    f.findCustomer.mockResolvedValueOnce({ ...customer, archivedAt: now });

    await expect(useCase.execute(params)).rejects.toThrow('CUSTOMER_ARCHIVED');
    expect(f.quotes.save).not.toHaveBeenCalled();
    expect(await useCase.execute(params)).toMatchObject({ status: 'SENT', version: 2, sentAt: expect.any(Date) });
  });

  it('creates the work order and rounded down payment before persisting approval', async () => {
    const value = quote();
    value.markSent(now);
    const f = fixture(value);

    const result = await new ApproveQuoteUseCase(f.service).execute(params);

    expect(result).toMatchObject({ status: 'APPROVED', version: 2 });

    const order = f.workOrders.create.mock.calls[0]![0].snapshot();

    expect(order).toMatchObject({
      quoteId: 'quote',
      organizationId: 'org',
      assignedToId: 'worker',
      serviceAddress: 'Rua de teste',
      totalInCents: 10001
    });

    const payment = f.receivables.create.mock.calls[0]![0].snapshot();

    expect(payment).toMatchObject({
      workOrderId: order.id,
      kind: 'DOWN_PAYMENT',
      amountInCents: 2500,
      receivedInCents: 0
    });
    expect(f.workOrders.create.mock.invocationCallOrder[0]).toBeLessThan(f.receivables.create.mock.invocationCallOrder[0]!);
    expect(f.receivables.create.mock.invocationCallOrder[0]).toBeLessThan(f.quotes.save.mock.invocationCallOrder[0]!);
  });

  it('does not persist approval if financial creation fails', async () => {
    const value = quote();
    value.markSent(now);
    const f = fixture(value);
    f.receivables.create.mockRejectedValueOnce(new Error('ledger unavailable'));

    await expect(new ApproveQuoteUseCase(f.service).execute(params)).rejects.toThrow('ledger unavailable');
    expect(f.quotes.save).not.toHaveBeenCalled();
  });

  it('keeps declined or canceled quotes from creating orders or financial entries', async () => {
    const value = quote();
    value.markSent(now);
    const f = fixture(value);

    expect(await new DeclineQuoteUseCase(f.service).execute(params)).toMatchObject({ status: 'DECLINED', version: 2 });
    expect(await new CancelQuoteUseCase(f.service).execute(params)).toMatchObject({ status: 'CANCELED', version: 2 });
    expect(f.workOrders.create).not.toHaveBeenCalled();
    expect(f.receivables.create).not.toHaveBeenCalled();
  });

  it('rejects a nonmember before loading any tenant data', async () => {
    const f = fixture(quote(), { ...access, isMember: false });

    await expect(new ApproveQuoteUseCase(f.service).execute(params)).rejects.toThrow('MEMBER_REQUIRED');
    expect(f.quotes.findById).not.toHaveBeenCalled();
    expect(f.workOrders.create).not.toHaveBeenCalled();
  });
});

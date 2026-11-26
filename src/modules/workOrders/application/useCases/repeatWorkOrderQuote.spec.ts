import { describe, expect, it, vi } from 'vitest';

import type { OrganizationAccessContext } from '../../../../modules/organizations/domain/policies/organizationAccess.policy.js';
import type {
  QuoteActorParams,
  QuoteReadContext,
  QuoteTransaction,
} from '../../../../modules/quotes/application/ports/quoteUnitOfWork.port.js';
import { QuoteUnitOfWork } from '../../../../modules/quotes/application/ports/quoteUnitOfWork.port.js';
import { QuoteApplicationService } from '../../../../modules/quotes/application/services/quoteApplicationService.service.js';
import { RepeatWorkOrderQuoteUseCase } from '../../../../modules/quotes/application/useCases/repeatWorkOrderQuote.useCase.js';
import { Quote } from '../../../../modules/quotes/domain/entities/quote.entity.js';
import { QuoteItem } from '../../../../modules/quotes/domain/entities/quoteItem.entity.js';
import { WorkOrder } from '../../domain/entities/workOrder.entity.js';

const params = {
  organizationId: 'organization',
  userId: 'operator',
  quoteId: 'source-quote'
};
const originalTime = new Date('2026-01-01T12:00:00.000Z');

class FixtureUnitOfWork extends QuoteUnitOfWork {
  constructor(private readonly tx: QuoteTransaction) {
    super();
  }

  read<T>(_params: QuoteActorParams, _operation: (context: QuoteReadContext) => Promise<T>): Promise<T> {
    throw new Error('The recurrence action must use a write transaction.');
  }

  async run<T>(_params: QuoteActorParams, operation: (tx: QuoteTransaction) => Promise<T>): Promise<T> {
    return operation(this.tx);
  }
}

function setup() {
  const customer = {
    id: 'customer',
    name: 'Cliente original',
    email: 'original@example.com',
    phone: '11999999999',
    archivedAt: null,
  };
  const sourceQuote = Quote.create(
    {
      id: params.quoteId,
      organizationId: params.organizationId,
      userId: 'original-operator',
      customer,
      details: {
        title: 'Orçamento original',
        notes: 'Instruções anteriores',
        validUntil: new Date('2026-01-08T12:00:00.000Z'),
        paymentCondition: 'DOWN_PAYMENT_AND_BALANCE',
        downPaymentPercentage: 30,
      },
    },
    originalTime,
  );

  sourceQuote.addItem(
    QuoteItem.create(
      'source-item-1',
      {
        name: 'Limpeza',
        description: 'Limpeza completa',
        unit: 'HOUR',
        quantity: '1.375',
        unitAmountInCents: 199,
      },
      'catalog-service',
    ),
  );
  sourceQuote.addItem(
    QuoteItem.create('source-item-2', {
      name: 'Material',
      unit: 'UNIT',
      quantity: '2',
      unitAmountInCents: 600,
    }),
  );
  sourceQuote.update({ discountInCents: 74 }, originalTime);
  sourceQuote.markSent(originalTime);
  sourceQuote.approve(originalTime);

  const source = sourceQuote.snapshot();
  const order = WorkOrder.create(
    {
      id: 'source-order',
      organizationId: params.organizationId,
      userId: 'original-operator',
      quote: source,
      itemIds: ['order-item-1', 'order-item-2'],
    },
    originalTime,
  );

  order.update({ title: 'Limpeza residencial', serviceAddress: 'Endereço anterior' });
  order.assign('original-operator');
  order.start(originalTime);
  order.complete(originalTime);

  const workOrder = order.snapshot();
  const access: OrganizationAccessContext = {
    isMember: true,
    verified: true,
    hasPlatformAccess: true,
    source: 'SUBSCRIPTION',
    billingNeedsReconciliation: false,
  };
  const currentCustomer = {
    ...customer,
    name: 'Cliente atualizado',
    email: 'updated@example.com'
  };
  const create = vi.fn<QuoteTransaction['quotes']['create']>().mockResolvedValue(undefined);
  const findById = vi.fn<QuoteTransaction['quotes']['findById']>().mockResolvedValue(source);
  const findByQuoteId = vi.fn<QuoteTransaction['workOrders']['findByQuoteId']>().mockResolvedValue(workOrder);
  const findCustomer = vi.fn<QuoteTransaction['findCustomer']>().mockResolvedValue(currentCustomer);
  const createWorkOrder = vi.fn<QuoteTransaction['workOrders']['create']>().mockResolvedValue(undefined);
  const createReceivable = vi.fn();
  const enqueue = vi.fn();
  const tx = {
    access,
    quotes: { create, findById },
    workOrders: { findByQuoteId, create: createWorkOrder },
    receivables: { create: createReceivable },
    notifications: { enqueue },
    findCustomer,
  } as unknown as QuoteTransaction;
  const useCase = new RepeatWorkOrderQuoteUseCase(new QuoteApplicationService(new FixtureUnitOfWork(tx)));

  return {
    source,
    workOrder,
    access,
    currentCustomer,
    create,
    findById,
    findByQuoteId,
    findCustomer,
    createWorkOrder,
    createReceivable,
    enqueue,
    useCase,
  };
}

describe('repeat a completed service', () => {
  it('creates an independent draft with historical amounts and current customer data', async () => {
    const fixture = setup();
    const sourceBefore = structuredClone(fixture.source);
    const orderBefore = structuredClone(fixture.workOrder);

    const result = await fixture.useCase.execute(params);

    expect(result).toMatchObject({
      organizationId: params.organizationId,
      customerId: fixture.source.customerId,
      customerName: 'Cliente atualizado',
      customerEmail: 'updated@example.com',
      title: 'Limpeza residencial',
      status: 'DRAFT',
      version: 1,
      notes: null,
      validUntil: null,
      sentAt: null,
      decidedAt: null,
      canceledAt: null,
      subtotalInCents: 1474,
      discountInCents: 74,
      totalInCents: 1400,
      paymentCondition: 'DOWN_PAYMENT_AND_BALANCE',
      downPaymentPercentage: 30,
      createdById: params.userId,
      changeRequest: null,
    });
    expect(result.id).not.toBe(fixture.source.id);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      catalogServiceId: null,
      quantityInThousandths: 1375,
      unitAmountInCents: 199,
      totalInCents: 274,
      position: 0,
    });
    expect(result.items[1]).toMatchObject({ totalInCents: 1200, position: 1 });

    const originalIds = [...fixture.source.items, ...fixture.workOrder.items].map((item) => item.id);

    expect(new Set(result.items.map((item) => item.id)).size).toBe(2);
    expect(result.items.every((item) => !originalIds.includes(item.id))).toBe(true);
    expect(fixture.create).toHaveBeenCalledOnce();
    expect(fixture.create.mock.calls[0][0].snapshot().items).toEqual(result.items);
    expect(fixture.source).toEqual(sourceBefore);
    expect(fixture.workOrder).toEqual(orderBefore);
    expect(fixture.createWorkOrder).not.toHaveBeenCalled();
    expect(fixture.createReceivable).not.toHaveBeenCalled();
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });

  it.each(['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'CANCELED'] as const)(
    'rejects a work order in status %s',
    async (status) => {
      const fixture = setup();
      fixture.workOrder.status = status;

      await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'QUOTE_REPEAT_NOT_AVAILABLE' });
      expect(fixture.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing or cross-organization source order', async () => {
    const fixture = setup();
    fixture.findByQuoteId.mockResolvedValueOnce(null);

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'QUOTE_REPEAT_NOT_AVAILABLE' });

    fixture.workOrder.organizationId = 'another-organization';

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'QUOTE_REPEAT_NOT_AVAILABLE' });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('rejects a missing completion timestamp or a different customer', async () => {
    const fixture = setup();
    fixture.workOrder.completedAt = null;

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'QUOTE_REPEAT_NOT_AVAILABLE' });

    fixture.workOrder.completedAt = originalTime;
    fixture.workOrder.customerId = 'different-customer';

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'QUOTE_REPEAT_NOT_AVAILABLE' });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('rejects a missing quote and a quote that was not approved', async () => {
    const fixture = setup();
    fixture.findById.mockResolvedValueOnce(null);

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' });

    fixture.source.status = 'DRAFT';

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'QUOTE_REPEAT_NOT_AVAILABLE' });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('rejects archived and missing customers', async () => {
    const fixture = setup();
    fixture.findCustomer.mockResolvedValueOnce({ ...fixture.currentCustomer, archivedAt: originalTime });

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'CUSTOMER_ARCHIVED' });

    fixture.findCustomer.mockResolvedValueOnce(null);

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('enforces membership, verification, active access and billing reconciliation', async () => {
    const fixture = setup();
    fixture.access.isMember = false;

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'MEMBER_REQUIRED' });

    fixture.access.isMember = true;
    fixture.access.verified = false;

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'VERIFIED_USER_REQUIRED' });

    fixture.access.verified = true;
    fixture.access.hasPlatformAccess = false;

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });

    fixture.access.billingNeedsReconciliation = true;

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'BILLING_RECONCILIATION_REQUIRED' });
    expect(fixture.findById).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('rejects invalid historical totals without saving a partial draft', async () => {
    const fixture = setup();
    fixture.workOrder.totalInCents++;

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'INVALID_QUOTE_AMOUNT' });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('rejects historical amounts in a different currency', async () => {
    const fixture = setup();
    fixture.workOrder.currency = 'usd';

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'INVALID_QUOTE_AMOUNT' });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it('rejects empty source items', async () => {
    const fixture = setup();
    fixture.workOrder.items = [];

    await expect(fixture.useCase.execute(params)).rejects.toMatchObject({ code: 'QUOTE_EMPTY' });
    expect(fixture.create).not.toHaveBeenCalled();
  });
});

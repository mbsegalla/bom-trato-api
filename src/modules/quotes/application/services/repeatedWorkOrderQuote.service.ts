import { randomUUID } from 'node:crypto';

import type { WorkOrderProps } from '../../../workOrders/domain/types/workOrder.types.js';
import type { QuoteProps } from '../../domain/entities/quote.entity.js';
import { Quote } from '../../domain/entities/quote.entity.js';
import { QuoteItem } from '../../domain/entities/quoteItem.entity.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import type { QuoteActorParams, QuoteCustomerSource } from '../ports/quoteUnitOfWork.port.js';

export function assertRepeatableWorkOrder(
  source: QuoteProps,
  workOrder: WorkOrderProps | null,
  organizationId: string,
): asserts workOrder is WorkOrderProps {
  if (
    source.status !== 'APPROVED' ||
    source.organizationId !== organizationId ||
    workOrder === null ||
    workOrder.status !== 'COMPLETED' ||
    workOrder.completedAt === null ||
    workOrder.organizationId !== organizationId ||
    workOrder.quoteId !== source.id ||
    workOrder.customerId !== source.customerId
  ) {
    throw new QuoteError('QUOTE_REPEAT_NOT_AVAILABLE');
  }

  if (workOrder.items.length === 0) {
    throw new QuoteError('QUOTE_EMPTY');
  }

  if (workOrder.currency !== 'brl') {
    throw new QuoteError('INVALID_QUOTE_AMOUNT');
  }
}

export function createRepeatedWorkOrderQuote(
  params: QuoteActorParams,
  source: QuoteProps,
  workOrder: WorkOrderProps,
  customer: QuoteCustomerSource,
  now: Date,
): Quote {
  assertRepeatableWorkOrder(source, workOrder, params.organizationId);

  if (customer.id !== workOrder.customerId || customer.archivedAt !== null) {
    throw new QuoteError('CUSTOMER_ARCHIVED');
  }

  const quote = Quote.create(
    {
      id: randomUUID(),
      organizationId: params.organizationId,
      userId: params.userId,
      customer,
      details: {
        title: workOrder.title,
        paymentCondition: source.paymentCondition,
        downPaymentPercentage: source.downPaymentPercentage,
      },
    },
    now,
  );

  const items = [...workOrder.items].sort((left, right) => left.position - right.position);

  for (const item of items) {
    quote.addItem(
      QuoteItem.create(randomUUID(), {
        name: item.name,
        description: item.description,
        unit: item.unit,
        quantity: (item.quantityInThousandths / 1000).toFixed(3),
        unitAmountInCents: item.unitAmountInCents,
      }),
    );
  }

  quote.update({ discountInCents: workOrder.discountInCents }, now);

  const result = quote.snapshot();

  if (result.subtotalInCents !== workOrder.subtotalInCents || result.totalInCents !== workOrder.totalInCents) {
    throw new QuoteError('INVALID_QUOTE_AMOUNT');
  }

  return quote;
}

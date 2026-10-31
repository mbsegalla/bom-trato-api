import { randomUUID } from 'node:crypto';

import type { QuoteProps } from '../../../quotes/domain/entities/quote.entity.js';
import { WorkOrder } from '../../domain/entities/workOrder.entity.js';
import type { WorkOrderRepository } from '../../domain/repositories/workOrder.repository.js';
import type { WorkOrderProps } from '../../domain/types/workOrder.types.js';

interface EnsureWorkOrderFromApprovedQuoteParams {
  workOrders: Pick<WorkOrderRepository, 'findByQuoteId' | 'create'>;
  quote: QuoteProps;
  createdById: string;
  assignedToId: string | null;
  serviceAddress: string | null;
  now: Date;
}

export async function ensureWorkOrderFromApprovedQuote(
  params: EnsureWorkOrderFromApprovedQuoteParams,
): Promise<WorkOrderProps> {
  const { workOrders, quote, createdById, assignedToId, serviceAddress, now } = params;

  const existing = await workOrders.findByQuoteId(quote.id);

  if (existing !== null) {
    return existing;
  }

  const order = WorkOrder.create(
    {
      id: randomUUID(),
      organizationId: quote.organizationId,
      userId: createdById,
      quote,
      itemIds: quote.items.map(() => randomUUID()),
    },
    now,
  );

  if (serviceAddress !== null) {
    order.update({
      serviceAddress,
    });
  }

  if (assignedToId !== null) {
    order.assign(assignedToId);
  }

  await workOrders.create(order);

  return order.snapshot();
}

import { randomUUID } from 'node:crypto';

import { Quote } from '../../domain/entities/quote.entity.js';
import { QuoteItem } from '../../domain/entities/quoteItem.entity.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { QuoteByIdParams, QuoteDetailsResult } from '../types/quote.types.js';

export class RepeatWorkOrderQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: QuoteByIdParams): Promise<QuoteDetailsResult> {
    return this.processor.run(params, async (tx) => {
      const source = (await this.processor.load(tx, params.quoteId)).snapshot();
      const workOrder = await tx.workOrders.findByQuoteId(source.id);

      if (
        source.status !== 'APPROVED' ||
        workOrder === null ||
        workOrder.status !== 'COMPLETED' ||
        workOrder.completedAt === null ||
        workOrder.organizationId !== params.organizationId ||
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

      const customer = await this.processor.customer(tx, workOrder.customerId);
      const now = new Date();
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

      await tx.quotes.create(quote);

      return { ...result, changeRequest: null };
    });
  }
}

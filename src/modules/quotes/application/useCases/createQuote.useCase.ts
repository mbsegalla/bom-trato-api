import { randomUUID } from 'node:crypto';

import { Quote } from '../../domain/entities/quote.entity.js';
import type { QuoteActorParams } from '../ports/quoteUnitOfWork.port.js';
import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { QuoteDetailsInput } from '../types/quote.types.js';

export class CreateQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: QuoteActorParams, input: QuoteDetailsInput & { customerId: string }) {
    const { customerId, title, ...detailsInput } = input;

    return this.processor.run(params, async (tx) => {
      const customer = await this.processor.customer(tx, customerId);

      const quote = Quote.create(
        {
          id: randomUUID(),
          ...params,
          customer,
          details: {
            ...this.processor.details(detailsInput),
            title,
          },
        },
        new Date(),
      );

      await tx.quotes.create(quote);

      return quote.snapshot();
    });
  }
}

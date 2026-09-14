import { randomUUID } from 'node:crypto';

import { Quote } from '../../domain/entities/quote.entity.js';
import { QuoteItem } from '../../domain/entities/quoteItem.entity.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import { QuoteAccessPolicy } from '../../domain/policies/quoteAccess.policy.js';
import type {
  QuoteActorParams,
  QuoteReadContext,
  QuoteTransaction,
  QuoteUnitOfWork,
} from '../ports/quoteUnitOfWork.port.js';
import type { AddQuoteItemInput, ChangeQuoteParams, UpdateQuoteInput } from '../types/quote.types.js';

export class QuoteApplicationService {
  constructor(private readonly unitOfWork: QuoteUnitOfWork) {}

  read<T>(params: QuoteActorParams, operation: (context: QuoteReadContext) => Promise<T>): Promise<T> {
    return this.unitOfWork.read(params, (context) => {
      new QuoteAccessPolicy(context.access).assertCanManage();

      return operation(context);
    });
  }

  run<T>(params: QuoteActorParams, operation: (tx: QuoteTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      new QuoteAccessPolicy(tx.access).assertCanManage();

      return operation(tx);
    });
  }

  async load(context: QuoteReadContext, id: string): Promise<Quote> {
    const state = await context.quotes.findById(id);

    if (state === null) {
      throw new QuoteError('QUOTE_NOT_FOUND');
    }

    return Quote.restore(state);
  }

  mutate(
    params: ChangeQuoteParams,
    operation: (quote: Quote, tx: QuoteTransaction, now: Date) => void | Promise<void>,
  ) {
    return this.run(params, async (tx) => {
      const quote = await this.load(tx, params.quoteId);

      quote.assertVersion(params.version);

      const now = new Date();

      await operation(quote, tx, now);

      quote.recordChange(params.userId, now);

      await tx.quotes.save(quote, params.version);

      return quote.snapshot();
    });
  }

  details(input: UpdateQuoteInput) {
    const { title, notes, discountInCents, validUntil: inputValidUntil } = input;

    let validUntil: Date | null | undefined;

    if (inputValidUntil !== undefined) {
      validUntil = inputValidUntil === null ? null : new Date(inputValidUntil);
    }

    return {
      title,
      notes,
      discountInCents,
      validUntil,
    };
  }

  async customer(tx: QuoteTransaction, id: string) {
    const customer = await tx.findCustomer(id);

    if (customer === null) {
      throw new QuoteError('CUSTOMER_NOT_FOUND');
    }

    if (customer.archivedAt !== null) {
      throw new QuoteError('CUSTOMER_ARCHIVED');
    }

    return customer;
  }

  async item(tx: QuoteTransaction, input: AddQuoteItemInput, id: string = randomUUID()): Promise<QuoteItem> {
    const { catalogServiceId, custom, quantity } = input;

    if ((catalogServiceId !== undefined) === (custom !== undefined)) {
      throw new QuoteError('INVALID_QUOTE_ITEM');
    }

    if (catalogServiceId !== undefined) {
      const source = await tx.findCatalogService(catalogServiceId);

      if (source === null) {
        throw new QuoteError('CATALOG_SERVICE_NOT_FOUND');
      }

      if (source.archivedAt !== null) {
        throw new QuoteError('CATALOG_SERVICE_ARCHIVED');
      }

      if (source.currency !== 'brl') {
        throw new QuoteError('INVALID_QUOTE_AMOUNT');
      }

      return QuoteItem.create(
        id,
        {
          name: source.name,
          description: source.description,
          unit: source.unit,
          unitAmountInCents: source.amountInCents,
          quantity,
        },
        source.id,
      );
    }

    if (input.custom === undefined || input.custom === null) {
      throw new QuoteError('INVALID_QUOTE_ITEM');
    }

    return QuoteItem.create(id, {
      ...input.custom,
      quantity: input.quantity,
    });
  }
}

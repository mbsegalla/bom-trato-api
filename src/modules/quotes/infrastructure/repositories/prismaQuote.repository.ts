import type { Prisma } from '../../../../generated/prisma/client.js';
import type { Quote, QuoteProps } from '../../domain/entities/quote.entity.js';
import type { QuoteItemProps } from '../../domain/entities/quoteItem.entity.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import { QuoteRepository } from '../../domain/repositories/quote.repository.js';
import type { QuotePage, QuotePageParams } from '../../domain/types/quotePage.types.js';
import type { QuoteSummary } from '../../domain/types/quoteSummary.types.js';

const include = {
  quoteItems: {
    orderBy: {
      position: 'asc',
    },
    select: {
      id: true,
      catalogServiceId: true,
      name: true,
      description: true,
      unit: true,
      quantityInThousandths: true,
      unitAmountInCents: true,
      totalInCents: true,
      position: true,
    },
  },
} satisfies Prisma.QuoteInclude;

const summarySelect = {
  id: true,
  organizationId: true,
  customerId: true,
  customerName: true,
  title: true,
  status: true,
  currency: true,
  totalInCents: true,
  version: true,
  validUntil: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QuoteSelect;

type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof include }>;

export class PrismaQuoteRepository extends QuoteRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  async create(quote: Quote): Promise<void> {
    const { items, ...state } = this.scopedState(quote);

    await this.db.quote.create({
      data: {
        ...state,
        quoteItems: {
          create: items,
        },
        quoteStatusHistories: {
          create: {
            fromStatus: null,
            toStatus: state.status,
            actorId: state.createdById,
            version: state.version,
            createdAt: state.createdAt,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<QuoteProps | null> {
    const row = await this.db.quote.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
      include,
    });

    return row === null ? null : this.toProps(row);
  }

  async list(params: QuotePageParams): Promise<QuotePage<QuoteSummary>> {
    const { page, limit, status, customerId } = params;

    const rows = await this.db.quote.findMany({
      where: {
        organizationId: this.organizationId,
        status,
        customerId,
      },
      select: summarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    return {
      items: rows.slice(0, limit),
      page,
      hasMore: rows.length > limit,
    };
  }

  async save(quote: Quote, expectedVersion: number): Promise<void> {
    const state = this.scopedState(quote);

    const previous = await this.db.quote.findFirst({
      where: {
        id: state.id,
        organizationId: this.organizationId,
        version: expectedVersion,
      },
      select: {
        status: true,
        quoteItems: include.quoteItems,
      },
    });

    if (previous === null) {
      throw new QuoteError('QUOTE_VERSION_CONFLICT');
    }

    const result = await this.db.quote.updateMany({
      where: {
        id: state.id,
        organizationId: this.organizationId,
        version: expectedVersion,
      },
      data: {
        title: state.title,
        notes: state.notes,
        status: state.status,
        validUntil: state.validUntil,
        discountInCents: state.discountInCents,
        subtotalInCents: state.subtotalInCents,
        totalInCents: state.totalInCents,
        version: state.version,
        sentAt: state.sentAt,
        decidedAt: state.decidedAt,
        canceledAt: state.canceledAt,
        updatedById: state.updatedById,
        updatedAt: state.updatedAt,
      },
    });

    if (result.count !== 1) {
      throw new QuoteError('QUOTE_VERSION_CONFLICT');
    }

    await this.saveItems(state.id, previous.quoteItems, state.items);

    if (previous.status !== state.status) {
      await this.db.quoteStatusHistory.create({
        data: {
          quoteId: state.id,
          fromStatus: previous.status,
          toStatus: state.status,
          actorId: state.updatedById,
          version: state.version,
          createdAt: state.updatedAt,
        },
      });
    }
  }

  async listStatusHistory(quoteId: string) {
    const quote = await this.db.quote.findFirst({
      where: {
        id: quoteId,
        organizationId: this.organizationId,
      },
      select: {
        id: true,
      },
    });

    if (quote === null) {
      throw new QuoteError('QUOTE_NOT_FOUND');
    }

    return this.db.quoteStatusHistory.findMany({
      where: {
        quoteId,
        quote: {
          organizationId: this.organizationId,
        },
      },
      orderBy: [{ version: 'asc' }, { id: 'asc' }],
    });
  }

  private toProps(row: QuoteRow): QuoteProps {
    const { quoteItems, ...state } = row;

    return {
      ...state,
      items: quoteItems,
    };
  }

  private scopedState(quote: Quote): QuoteProps {
    const state = quote.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new QuoteError('QUOTE_NOT_FOUND');
    }

    return state;
  }

  private async saveItems(
    quoteId: string,
    previousItems: QuoteItemProps[],
    nextItems: QuoteItemProps[],
  ): Promise<void> {
    const previousById = new Map(previousItems.map((item) => [item.id, item]));

    const nextIds = new Set(nextItems.map((item) => item.id));

    if (nextIds.size !== nextItems.length) {
      throw new QuoteError('INVALID_QUOTE_ITEM');
    }

    const removedIds = previousItems.filter((item) => !nextIds.has(item.id)).map((item) => item.id);

    if (removedIds.length > 0) {
      await this.db.quoteItem.deleteMany({
        where: {
          quoteId,
          id: { in: removedIds },
          quote: { organizationId: this.organizationId },
        },
      });
    }

    const createdItems = nextItems.filter((item) => !previousById.has(item.id));

    if (createdItems.length > 0) {
      await this.db.quoteItem.createMany({
        data: createdItems.map((item) => ({
          ...item,
          quoteId,
        })),
      });
    }

    for (const item of nextItems) {
      const previous = previousById.get(item.id);

      if (previous === undefined || this.sameItem(previous, item)) {
        continue;
      }

      const result = await this.db.quoteItem.updateMany({
        where: {
          id: item.id,
          quoteId,
          quote: { organizationId: this.organizationId },
        },
        data: {
          catalogServiceId: item.catalogServiceId,
          name: item.name,
          description: item.description,
          unit: item.unit,
          quantityInThousandths: item.quantityInThousandths,
          unitAmountInCents: item.unitAmountInCents,
          totalInCents: item.totalInCents,
          position: item.position,
        },
      });

      if (result.count !== 1) {
        throw new QuoteError('QUOTE_VERSION_CONFLICT');
      }
    }
  }

  private sameItem(previous: QuoteItemProps, next: QuoteItemProps): boolean {
    return (
      previous.catalogServiceId === next.catalogServiceId &&
      previous.name === next.name &&
      previous.description === next.description &&
      previous.unit === next.unit &&
      previous.quantityInThousandths === next.quantityInThousandths &&
      previous.unitAmountInCents === next.unitAmountInCents &&
      previous.totalInCents === next.totalInCents &&
      previous.position === next.position
    );
  }
}

import type { Prisma } from '../../../../generated/prisma/client.js';
import type { Quote, QuoteProps } from '../../domain/entities/quote.entity.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import { QuoteRepository } from '../../domain/repositories/quote.repository.js';
import type { QuotePage, QuotePageParams } from '../../domain/types/quotePage.types.js';

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

  async list(params: QuotePageParams): Promise<QuotePage<QuoteProps>> {
    const { page, limit, status, customerId } = params;

    const rows = await this.db.quote.findMany({
      where: {
        organizationId: this.organizationId,
        status,
        customerId,
      },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    return {
      items: rows.slice(0, limit).map((row) => this.toProps(row)),
      page,
      hasMore: rows.length > limit,
    };
  }

  async save(quote: Quote, expectedVersion: number): Promise<void> {
    const state = this.scopedState(quote);

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

    await this.db.quoteItem.deleteMany({
      where: {
        quoteId: state.id,
        quote: {
          organizationId: this.organizationId,
        },
      },
    });

    if (state.items.length > 0) {
      await this.db.quoteItem.createMany({
        data: state.items.map((item) => ({
          ...item,
          quoteId: state.id,
        })),
      });
    }
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
}

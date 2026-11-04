import type { Prisma } from '../../../../generated/prisma/client.js';
import type { QuoteShare } from '../../domain/entities/quoteShare.entity.js';
import { QuoteShareError } from '../../domain/errors/quoteShare.error.js';
import { QuoteShareRepository } from '../../domain/repositories/quoteShare.repository.js';

export class PrismaQuoteShareRepository extends QuoteShareRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  findByHash(tokenHash: string) {
    return this.db.quoteShare.findFirst({
      where: {
        tokenHash,
        organizationId: this.organizationId,
      },
    });
  }

  async findLatestChangeRequest(quoteId: string) {
    const share = await this.db.quoteShare.findFirst({
      where: {
        quoteId,
        organizationId: this.organizationId,
        changeRequestedAt: {
          not: null,
        },
        changeRequestMessage: {
          not: null,
        },
      },
      select: {
        quoteVersion: true,
        changeRequestedAt: true,
        changeRequestMessage: true,
      },
      orderBy: [
        {
          changeRequestedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
    });

    if (share === null || share.changeRequestedAt === null || share.changeRequestMessage === null) {
      return null;
    }

    return {
      quoteVersion: share.quoteVersion,
      message: share.changeRequestMessage,
      requestedAt: share.changeRequestedAt,
    };
  }

  async create(quoteShare: QuoteShare): Promise<void> {
    const state = quoteShare.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }

    await this.db.quoteShare.create({
      data: state,
    });
  }

  async revokeForQuote(quoteId: string, now: Date): Promise<void> {
    await this.db.quoteShare.updateMany({
      where: {
        quoteId,
        organizationId: this.organizationId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });
  }

  async saveDecision(quoteShare: QuoteShare): Promise<void> {
    const state = quoteShare.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }

    const result = await this.db.quoteShare.updateMany({
      where: {
        id: state.id,
        organizationId: this.organizationId,
        revokedAt: null,
        decision: null,
        changeRequestedAt: null,
      },
      data: {
        decision: state.decision,
        decidedAt: state.decidedAt,
        decidedVersion: state.decidedVersion,
      },
    });

    if (result.count !== 1) {
      throw new QuoteShareError('QUOTE_SHARE_ALREADY_DECIDED');
    }
  }

  async saveChangeRequest(quoteShare: QuoteShare): Promise<void> {
    const state = quoteShare.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }

    const result = await this.db.quoteShare.updateMany({
      where: {
        id: state.id,
        organizationId: this.organizationId,
        revokedAt: null,
        decision: null,
        changeRequestedAt: null,
      },
      data: {
        changeRequestedAt: state.changeRequestedAt,
        changeRequestMessage: state.changeRequestMessage,
      },
    });

    if (result.count !== 1) {
      throw new QuoteShareError('QUOTE_SHARE_CHANGE_ALREADY_REQUESTED');
    }
  }
}

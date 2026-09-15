import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { OrganizationTransactionMode } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type {
  PublicQuoteReadContext,
  PublicQuoteTransaction,
} from '../../application/ports/publicQuoteUnitOfWork.port.js';
import { PublicQuoteUnitOfWork } from '../../application/ports/publicQuoteUnitOfWork.port.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import { QuoteShareError } from '../../domain/errors/quoteShare.error.js';
import { PrismaQuoteRepository } from '../repositories/prismaQuote.repository.js';
import { PrismaQuoteShareRepository } from '../repositories/prismaQuoteShare.repository.js';

@Injectable()
export class PrismaPublicQuoteUnitOfWork extends PublicQuoteUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(hash: string, operation: (context: PublicQuoteReadContext) => Promise<T>): Promise<T> {
    return this.execute('read', hash, operation);
  }

  run<T>(hash: string, operation: (tx: PublicQuoteTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', hash, operation);
  }

  private async execute<T>(
    mode: OrganizationTransactionMode,
    hash: string,
    operation: (tx: PublicQuoteTransaction) => Promise<T>,
  ): Promise<T> {
    const source = await this.prisma.quoteShare.findUnique({
      where: {
        tokenHash: hash,
      },
      select: {
        organizationId: true,
      },
    });

    if (source === null) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }

    const { organizationId } = source;

    return organizationTransaction(
      this.prisma,
      organizationId,
      mode,
      (db) =>
        operation({
          quotes: new PrismaQuoteRepository(db, organizationId),
          shares: new PrismaQuoteShareRepository(db, organizationId),
          findOrganization: () =>
            db.organization.findUnique({
              where: {
                id: organizationId,
              },
              select: {
                name: true,
              },
            }),
        }),
      {
        notFound: () => new QuoteShareError('QUOTE_SHARE_NOT_FOUND'),
        busy: () => new QuoteError('QUOTES_BUSY'),
      },
    );
  }
}

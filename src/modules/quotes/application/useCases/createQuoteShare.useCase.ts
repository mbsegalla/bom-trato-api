import { randomUUID } from 'node:crypto';

import { QuoteShare } from '../../domain/entities/quoteShare.entity.js';
import type { QuoteShareSecurity } from '../ports/quoteShareSecurity.port.js';
import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { ChangeQuoteParams } from '../types/quote.types.js';

export class CreateQuoteShareUseCase {
  constructor(
    private readonly processor: QuoteApplicationService,
    private readonly security: QuoteShareSecurity,
  ) {}

  execute(params: ChangeQuoteParams, expiresAt: string) {
    return this.processor.run(params, async (tx) => {
      const quote = await this.processor.load(tx, params.quoteId);

      quote.assertVersion(params.version);

      const now = new Date();
      const issued = this.security.issue();

      const share = QuoteShare.create(
        {
          id: randomUUID(),
          tokenHash: issued.hash,
          userId: params.userId,
          expiresAt: new Date(expiresAt),
        },
        quote,
        now,
      );

      await tx.shares.revokeForQuote(params.quoteId, now);
      await tx.shares.create(share);

      const state = share.snapshot();

      return {
        id: state.id,
        token: issued.token,
        quoteVersion: params.version,
        expiresAt: state.expiresAt,
      };
    });
  }
}

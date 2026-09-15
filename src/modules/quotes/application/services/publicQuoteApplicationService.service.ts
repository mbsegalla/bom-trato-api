import { Quote } from '../../domain/entities/quote.entity.js';
import { QuoteShare } from '../../domain/entities/quoteShare.entity.js';
import { QuoteShareError } from '../../domain/errors/quoteShare.error.js';
import type { PublicQuoteReadContext, PublicQuoteUnitOfWork } from '../ports/publicQuoteUnitOfWork.port.js';
import type { QuoteShareSecurity } from '../ports/quoteShareSecurity.port.js';

export class PublicQuoteApplicationService {
  constructor(
    private readonly unitOfWork: PublicQuoteUnitOfWork,
    private readonly security: QuoteShareSecurity,
  ) {}

  read(token: string) {
    const hash = this.security.hash(token);

    return this.unitOfWork.read(hash, async (context) => {
      const { quote, share } = await this.load(context, hash);
      const organization = await context.findOrganization();

      if (organization === null) {
        throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
      }

      return {
        organizationName: organization.name,
        quote: quote.snapshot(),
        share: share.snapshot(),
        generatedAt: new Date(),
      };
    });
  }

  decide(token: string, version: number, decision: 'APPROVED' | 'DECLINED') {
    const hash = this.security.hash(token);

    return this.unitOfWork.run(hash, async (context) => {
      const { quote, share } = await this.load(context, hash);
      const previousVersion = quote.snapshot().version;

      if (share.decide(quote, decision, version, new Date())) {
        await context.quotes.save(quote, previousVersion);
        await context.shares.saveDecision(share);
      }

      const state = share.snapshot();

      return {
        status: state.decision,
        decidedAt: state.decidedAt,
        version: state.decidedVersion,
      };
    });
  }

  private async load(context: PublicQuoteReadContext, hash: string) {
    const state = await context.shares.findByHash(hash);

    if (state === null) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }

    const quoteState = await context.quotes.findById(state.quoteId);

    if (quoteState === null) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }

    const quote = Quote.restore(quoteState);
    const share = QuoteShare.restore(state);

    share.assertReadable(quote, new Date());

    return { quote, share };
  }
}

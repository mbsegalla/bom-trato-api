import { randomUUID } from 'node:crypto';

import { AutomationEntityType, AutomationType } from '../../../../generated/prisma/enums.js';
import { QuoteShare } from '../../domain/entities/quoteShare.entity.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import type { QuoteShareSecurity } from '../ports/quoteShareSecurity.port.js';
import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { ChangeQuoteParams } from '../types/quote.types.js';

const FOLLOW_UP_DELAY_MS = 48 * 60 * 60 * 1000;

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

      const organization = await tx.findOrganization();

      if (organization === null) {
        throw new QuoteError('ORGANIZATION_NOT_FOUND');
      }

      await tx.shares.revokeForQuote(params.quoteId, now);
      await tx.shares.create(share);

      const state = share.snapshot();
      const quoteState = quote.snapshot();
      const followUpAt = new Date(now.getTime() + FOLLOW_UP_DELAY_MS);

      if (organization.autoQuoteFollowUpEnabled && quoteState.customerEmail !== null && followUpAt < state.expiresAt) {
        await tx.notifications.enqueue({
          key: `automation/quote-follow-up/${state.id}`,
          recipient: quoteState.customerEmail,
          content: {
            type: 'QUOTE_FOLLOW_UP',
            token: issued.token,
            customerName: quoteState.customerName,
            organizationName: organization.name,
            quoteTitle: quoteState.title,
          },
          availableAt: followUpAt,
          expiresAt: state.expiresAt,
          automation: {
            organizationId: quoteState.organizationId,
            type: AutomationType.QUOTE_FOLLOW_UP,
            entityType: AutomationEntityType.QUOTE,
            entityId: quoteState.id,
            contextId: state.id,
            description: 'Follow-up automático de orçamento',
            href: `/quotes/${quoteState.id}`,
          },
        });
      }

      return {
        id: state.id,
        token: issued.token,
        quoteVersion: params.version,
        expiresAt: state.expiresAt,
      };
    });
  }
}

import { QuoteStatus } from '../../../../generated/prisma/enums.js';
import { QuoteError } from '../errors/quote.error.js';
import { QuoteShareError } from '../errors/quoteShare.error.js';

import type { Quote } from './quote.entity.js';

export interface QuoteShareProps {
  id: string;
  organizationId: string;
  quoteId: string;
  quoteVersion: number;
  tokenHash: string;
  createdById: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  decision: QuoteStatus | null;
  decidedAt: Date | null;
  decidedVersion: number | null;
}

export class QuoteShare {
  private constructor(private props: QuoteShareProps) {}

  static create(
    params: {
      id: string;
      tokenHash: string;
      userId: string;
      expiresAt: Date;
    },
    quote: Quote,
    now: Date,
  ): QuoteShare {
    const state = quote.snapshot();

    if (state.status !== QuoteStatus.SENT) {
      throw new QuoteError('INVALID_QUOTE_TRANSITION');
    }

    if (state.validUntil !== null && state.validUntil <= now) {
      throw new QuoteError('QUOTE_EXPIRED');
    }

    if (
      !Number.isFinite(params.expiresAt.getTime()) ||
      params.expiresAt <= now ||
      params.expiresAt.getTime() - now.getTime() > 7 * 86400000 ||
      (state.validUntil !== null && params.expiresAt > state.validUntil)
    ) {
      throw new QuoteShareError('INVALID_QUOTE_SHARE_EXPIRATION');
    }

    return new QuoteShare({
      id: params.id,
      tokenHash: params.tokenHash,
      organizationId: state.organizationId,
      quoteId: state.id,
      quoteVersion: state.version,
      createdById: params.userId,
      createdAt: new Date(now),
      expiresAt: new Date(params.expiresAt),
      revokedAt: null,
      decision: null,
      decidedAt: null,
      decidedVersion: null,
    });
  }

  static restore(props: QuoteShareProps): QuoteShare {
    return new QuoteShare(structuredClone(props));
  }

  snapshot(): QuoteShareProps {
    return structuredClone(this.props);
  }

  assertReadable(quote: Quote, now: Date): void {
    const state = quote.snapshot();

    if (
      this.props.revokedAt !== null ||
      this.props.expiresAt <= now ||
      state.id !== this.props.quoteId ||
      state.organizationId !== this.props.organizationId
    ) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }

    const version = this.props.decidedVersion ?? this.props.quoteVersion;

    if (state.version !== version) {
      throw new QuoteError('QUOTE_VERSION_CONFLICT');
    }

    if (state.status !== (this.props.decision ?? QuoteStatus.SENT)) {
      throw new QuoteShareError('QUOTE_SHARE_NOT_FOUND');
    }
  }

  decide(quote: Quote, decision: 'APPROVED' | 'DECLINED', version: number, now: Date): boolean {
    this.assertReadable(quote, now);

    if (version !== this.props.quoteVersion) {
      throw new QuoteError('QUOTE_VERSION_CONFLICT');
    }

    if (this.props.decision !== null) {
      if (this.props.decision !== decision) {
        throw new QuoteShareError('QUOTE_SHARE_ALREADY_DECIDED');
      }

      return false;
    }

    if (decision === QuoteStatus.APPROVED) {
      quote.approve(now);
    } else {
      quote.decline(now);
    }

    quote.recordChange(null, now);

    this.props.decision = decision;
    this.props.decidedAt = new Date(now);
    this.props.decidedVersion = quote.snapshot().version;

    return true;
  }
}

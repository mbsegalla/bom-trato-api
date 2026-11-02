import { PaymentCondition, ReceivableKind } from '../../../../generated/prisma/enums.js';
import type { QuoteProps } from '../../../quotes/domain/entities/quote.entity.js';
import type { ReceivableSource, ReceivableView } from '../../domain/entities/receivable.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import type { ReceivableRepository } from '../../domain/repositories/receivable.repository.js';

import { ensureReceivableFromWorkOrder } from './receivableCreation.service.js';

type AutomatedReceivableRepository = Pick<ReceivableRepository, 'findByWorkOrderIdAndKind' | 'create'>;

interface AutomatedReceivableParams {
  receivables: AutomatedReceivableRepository;
  organizationId: string;
  userId: string;
  source: ReceivableSource;
  quote: Pick<QuoteProps, 'paymentCondition' | 'downPaymentPercentage' | 'totalInCents'>;
  now: Date;
}

interface FinalReceivableParams extends AutomatedReceivableParams {
  dueAt: Date;
}

function getDownPaymentAmountInCents(totalInCents: number, downPaymentPercentage: number | null): number {
  if (
    downPaymentPercentage === null ||
    !Number.isSafeInteger(downPaymentPercentage) ||
    downPaymentPercentage < 1 ||
    downPaymentPercentage > 99
  ) {
    throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
  }

  const amountInCents = Math.round((totalInCents * downPaymentPercentage) / 100);

  if (amountInCents <= 0 || amountInCents >= totalInCents) {
    throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
  }

  return amountInCents;
}

function assertSameAmount(source: ReceivableSource, quote: Pick<QuoteProps, 'totalInCents'>): void {
  if (source.totalInCents !== quote.totalInCents) {
    throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
  }
}

export async function ensureInitialReceivableFromQuote(
  params: AutomatedReceivableParams,
): Promise<ReceivableView | null> {
  const { receivables, organizationId, userId, source, quote, now } = params;

  assertSameAmount(source, quote);

  if (quote.totalInCents <= 0 || quote.paymentCondition === PaymentCondition.AFTER_COMPLETION) {
    return null;
  }

  if (quote.paymentCondition === PaymentCondition.UPFRONT) {
    return ensureReceivableFromWorkOrder({
      receivables,
      organizationId,
      userId,
      source,
      kind: ReceivableKind.FULL,
      amountInCents: quote.totalInCents,
      dueAt: now,
      notes: null,
      now,
    });
  }

  const downPaymentInCents = getDownPaymentAmountInCents(quote.totalInCents, quote.downPaymentPercentage);

  return ensureReceivableFromWorkOrder({
    receivables,
    organizationId,
    userId,
    source,
    kind: ReceivableKind.DOWN_PAYMENT,
    amountInCents: downPaymentInCents,
    dueAt: now,
    notes: null,
    now,
  });
}

export async function ensureFinalReceivableFromQuote(params: FinalReceivableParams): Promise<ReceivableView | null> {
  const { receivables, organizationId, userId, source, quote, dueAt, now } = params;

  assertSameAmount(source, quote);

  if (quote.totalInCents <= 0 || quote.paymentCondition === PaymentCondition.UPFRONT) {
    return null;
  }

  if (quote.paymentCondition === PaymentCondition.AFTER_COMPLETION) {
    return ensureReceivableFromWorkOrder({
      receivables,
      organizationId,
      userId,
      source,
      kind: ReceivableKind.FULL,
      amountInCents: quote.totalInCents,
      dueAt,
      notes: null,
      now,
    });
  }

  const downPaymentInCents = getDownPaymentAmountInCents(quote.totalInCents, quote.downPaymentPercentage);

  return ensureReceivableFromWorkOrder({
    receivables,
    organizationId,
    userId,
    source,
    kind: ReceivableKind.REMAINING_BALANCE,
    amountInCents: quote.totalInCents - downPaymentInCents,
    dueAt,
    notes: null,
    now,
  });
}

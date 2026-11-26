import type { ReceivableProps } from '../entities/receivable.entity.js';
import { ReceivableError } from '../errors/receivable.error.js';
import type {
  ProviderPaymentReference,
  ProviderPaymentReviewReason,
  RegisterProviderChargeInput,
  VerifiedProviderPayment,
} from '../types/receivableProviderPayment.types.js';
import { assertReceivableAmount, assertReceivableDate } from '../validation/receivable.validation.js';

interface RegisteredCharge {
  expectedAmountInCents: number;
  receivableVersion: number;
  registeredById: string;
  paymentId: string | null;
  reviewReason: ProviderPaymentReviewReason | null;
}

type PaymentDecision =
  { kind: 'APPLY' | 'DUPLICATE' } | { kind: 'REVIEW_REQUIRED'; reason: ProviderPaymentReviewReason };

function validIdentifier(value: string, limit: number): boolean {
  return typeof value === 'string' && value.length <= limit && /^[\x21-\x7E]+$/.test(value);
}

export function assertProviderPaymentReference(reference: ProviderPaymentReference): void {
  if (
    !/^[a-z][a-z0-9-]{0,31}$/.test(reference.provider) ||
    !validIdentifier(reference.externalAccountId, 128) ||
    !validIdentifier(reference.externalPaymentId, 128)
  ) {
    throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
  }
}

export function assertProviderChargeRegistration(input: RegisterProviderChargeInput): void {
  assertProviderPaymentReference(input);
  assertReceivableAmount(input.expectedAmountInCents);

  if (
    !Number.isSafeInteger(input.receivableVersion) ||
    input.receivableVersion < 1 ||
    input.receivableVersion > 2147483647
  ) {
    throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
  }
}

export function assertVerifiedProviderPayment(payment: VerifiedProviderPayment, now: Date): void {
  assertProviderPaymentReference(payment);
  assertReceivableAmount(payment.amountInCents);
  assertReceivableDate(payment.paidAt);

  if (!validIdentifier(payment.eventId, 200) || !/^[a-z]{3}$/.test(payment.currency)) {
    throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
  }

  if (payment.paidAt > now) {
    throw new ReceivableError('INVALID_PAYMENT_DATE');
  }
}

export function decideProviderPayment(
  charge: RegisteredCharge,
  receivable: ReceivableProps,
  ownerId: string,
  payment: VerifiedProviderPayment,
): PaymentDecision {
  if (charge.reviewReason !== null) {
    return { kind: 'REVIEW_REQUIRED', reason: charge.reviewReason };
  }

  if (payment.currency !== 'brl' || receivable.currency !== 'brl') {
    return { kind: 'REVIEW_REQUIRED', reason: 'CURRENCY_MISMATCH' };
  }

  if (payment.amountInCents !== charge.expectedAmountInCents) {
    return { kind: 'REVIEW_REQUIRED', reason: 'AMOUNT_MISMATCH' };
  }

  // A duplicate is checked before the version: applying the first event advances it.
  // A manually reversed payment also remains linked and cannot be applied again.
  if (charge.paymentId !== null) {
    return { kind: 'DUPLICATE' };
  }

  if (charge.registeredById !== ownerId) {
    return { kind: 'REVIEW_REQUIRED', reason: 'OWNER_CHANGED' };
  }

  if (receivable.status !== 'OPEN' && receivable.status !== 'PARTIALLY_PAID') {
    return { kind: 'REVIEW_REQUIRED', reason: 'RECEIVABLE_INELIGIBLE' };
  }

  if (
    receivable.version !== charge.receivableVersion ||
    receivable.version >= 2147483647 ||
    receivable.amountInCents - receivable.receivedInCents !== charge.expectedAmountInCents
  ) {
    return { kind: 'REVIEW_REQUIRED', reason: 'RECEIVABLE_CHANGED' };
  }

  return { kind: 'APPLY' };
}

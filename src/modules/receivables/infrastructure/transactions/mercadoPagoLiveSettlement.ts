import type { Prisma } from '../../../../generated/prisma/client.js';
import { assertVerifiedProviderPayment } from '../../domain/policies/receivableProviderPayment.policy.js';
import type { LivePixWebhookBinding, LiveWebhookOutcome } from '../../domain/types/mercadoPagoLiveWebhook.types.js';
import type { ClaimedMercadoPagoWebhook } from '../../domain/types/mercadoPagoWebhook.types.js';
import type { VerifiedProviderPayment } from '../../domain/types/receivableProviderPayment.types.js';

import { confirmRegisteredProviderPayment } from './prismaReceivableProviderPaymentRepository.js';

export type BoundIssuance = Prisma.MercadoPagoLivePixGetPayload<{ include: { providerCharge: true } }>;

export interface Disposition {
  kind: 'COMPLETE' | 'REVIEW' | 'RETRY';
  code: string;
  matchedIssuanceId: string | null;
}

export function retry(code: string): Disposition {
  return { kind: 'RETRY', code, matchedIssuanceId: null };
}

export function review(code: string, issuanceId: string | null = null): Disposition {
  return { kind: 'REVIEW', code, matchedIssuanceId: issuanceId };
}

function complete(code: string, issuanceId: string): Disposition {
  return { kind: 'COMPLETE', code, matchedIssuanceId: issuanceId };
}

export function bindingFrom(row: BoundIssuance, job: Pick<ClaimedMercadoPagoWebhook, 'clientId' | 'paymentId'>): LivePixWebhookBinding {
  return {
    issuanceId: row.id,
    organizationId: row.organizationId,
    receivableId: row.receivableId,
    receivableVersion: row.receivableVersion,
    ownerId: row.issuedById,
    clientId: job.clientId,
    accountId: row.accountId,
    paymentId: job.paymentId,
    amountInCents: row.amountInCents,
  };
}

export function matchesBinding(row: BoundIssuance | null, binding: LivePixWebhookBinding): row is BoundIssuance {
  if (row === null || row.providerCharge === null) return false;
  const charge = row.providerCharge;

  return row.id === binding.issuanceId &&
    row.organizationId === binding.organizationId &&
    row.receivableId === binding.receivableId &&
    row.receivableVersion === binding.receivableVersion &&
    row.issuedById === binding.ownerId &&
    row.clientId === binding.clientId &&
    row.accountId === binding.accountId &&
    row.externalPaymentId === binding.paymentId &&
    row.amountInCents === binding.amountInCents &&
    row.providerChargeId === row.id &&
    charge.id === row.id &&
    charge.organizationId === binding.organizationId &&
    charge.receivableId === binding.receivableId &&
    charge.receivableVersion === binding.receivableVersion &&
    charge.registeredById === binding.ownerId &&
    charge.provider === 'mercado-pago' &&
    charge.externalAccountId === binding.accountId &&
    charge.externalPaymentId === binding.paymentId &&
    charge.expectedAmountInCents === binding.amountInCents;
}

function verifiedForEvent(
  payment: VerifiedProviderPayment,
  binding: LivePixWebhookBinding,
  eventId: string,
): boolean {
  try {
    assertVerifiedProviderPayment(payment, new Date());
  } catch {
    return false;
  }

  return payment.provider === 'mercado-pago' &&
    payment.liveMode === true &&
    payment.eventId === eventId &&
    payment.externalAccountId === binding.accountId &&
    payment.externalPaymentId === binding.paymentId &&
    payment.amountInCents === binding.amountInCents &&
    payment.currency === 'brl';
}

export async function applyLivePixObservation(
  db: Prisma.TransactionClient,
  row: BoundIssuance,
  binding: LivePixWebhookBinding,
  eventId: string,
  observation: Extract<LiveWebhookOutcome, { kind: 'CHECKED' }>['observation'],
): Promise<Disposition> {
  if (observation.status === 'REFUNDED') return markLivePixReview(db, row, 'VERIFIED_REFUNDED');
  if (observation.status === 'INVALID_PROVIDER_PAYMENT') return markLivePixReview(db, row, 'INVALID_PROVIDER_PAYMENT');
  if (observation.status === 'REVIEW_REQUIRED') return markLivePixReview(db, row, 'VERIFIED_REVIEW_REQUIRED');

  // Review is sticky. In particular, an older approved lookup must never
  // apply after a refund, mismatch or authorization change was observed.
  if (
    row.settlementReviewCode !== null ||
    row.resultCode === 'SNAPSHOT_CHANGED' ||
    row.resultCode === 'BINDING_CONFLICT' ||
    (row.resultCode === 'UNCERTAIN_CREATION' && row.recoveredAt === null) ||
    row.status === 'RESERVED'
  ) {
    return markLivePixReview(db, row, 'ISSUANCE_REVIEW_REQUIRED');
  }

  if (observation.status === 'PENDING') {
    // Out-of-order pending events never reopen a terminal issuance.
    return complete('VERIFIED_PENDING', row.id);
  }

  if (observation.status === 'CLOSED') {
    if (row.providerCharge?.paymentId !== null || row.status === 'SETTLED') {
      return markLivePixReview(db, row, 'CLOSED_AFTER_SETTLEMENT');
    }

    await db.mercadoPagoLivePix.update({
      where: { id: row.id },
      data: { status: 'CLOSED', copyAndPasteCiphertext: null, expiresAt: null },
    });
    return complete('VERIFIED_CLOSED', row.id);
  }

  if (
    observation.status !== 'APPROVED' ||
    !verifiedForEvent(observation.payment, binding, eventId) ||
    observation.payment.paidAt.getTime() < row.createdAt.getTime() - 5 * 60 * 1000
  ) {
    return markLivePixReview(db, row, 'INVALID_PROVIDER_PAYMENT');
  }

  if (row.status === 'CLOSED') return markLivePixReview(db, row, 'APPROVAL_AFTER_CLOSURE');

  const result = await confirmRegisteredProviderPayment(
    db,
    { id: row.id, organizationId: binding.organizationId },
    observation.payment,
  );

  if (result !== 'APPLIED' && result !== 'DUPLICATE') {
    return markLivePixReview(db, row, 'LEDGER_' + result);
  }

  await db.mercadoPagoLivePix.update({
    where: { id: row.id },
    data: { status: 'SETTLED', copyAndPasteCiphertext: null, expiresAt: null },
  });

  return complete('LEDGER_' + result, row.id);
}

export async function markLivePixReview(db: Prisma.TransactionClient, row: BoundIssuance, code: string): Promise<Disposition> {
  await db.mercadoPagoLivePix.update({
    where: { id: row.id },
    data: {
      status: 'REVIEW_REQUIRED',
      resultCode: row.resultCode ?? 'VERIFIED_REVIEW_REQUIRED',
      settlementReviewCode: row.settlementReviewCode ?? code,
      copyAndPasteCiphertext: null,
      expiresAt: null,
    },
  });
  // Existing ledger entries, including manually reversed entries, are not
  // mutated on refund/chargeback; retain evidence for operational review.
  return review(code, row.id);
}

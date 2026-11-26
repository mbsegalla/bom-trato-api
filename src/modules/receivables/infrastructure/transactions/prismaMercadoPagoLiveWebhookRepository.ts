import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { MercadoPagoLiveWebhookRepository } from '../../application/ports/mercadoPagoLiveWebhookRepository.port.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { decideMercadoPagoCredentialAccess } from '../../domain/policies/mercadoPagoRefresh.policy.js';
import {
  MERCADO_PAGO_WEBHOOK_MAX_ATTEMPTS,
  mercadoPagoWebhookRetryDelaySeconds,
} from '../../domain/policies/mercadoPagoWebhookRetry.policy.js';
import { assertVerifiedProviderPayment } from '../../domain/policies/receivableProviderPayment.policy.js';
import type {
  LivePixWebhookBinding,
  LiveWebhookOutcome,
  LiveWebhookPreparation,
} from '../../domain/types/mercadoPagoLiveWebhook.types.js';
import type {
  ClaimedMercadoPagoWebhook,
  MercadoPagoWebhookNotice,
} from '../../domain/types/mercadoPagoWebhook.types.js';
import type { VerifiedProviderPayment } from '../../domain/types/receivableProviderPayment.types.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

import { confirmRegisteredProviderPayment } from './prismaReceivableProviderPaymentRepository.js';

type BoundIssuance = Prisma.MercadoPagoLivePixGetPayload<{ include: { providerCharge: true } }>;
type Db = Prisma.TransactionClient | PrismaService;

interface Disposition {
  kind: 'COMPLETE' | 'REVIEW' | 'RETRY';
  code: string;
  matchedIssuanceId: string | null;
}

class LeaseLost extends Error {}

function retry(code: string): Disposition {
  return { kind: 'RETRY', code, matchedIssuanceId: null };
}

function review(code: string, issuanceId: string | null = null): Disposition {
  return { kind: 'REVIEW', code, matchedIssuanceId: issuanceId };
}

function complete(code: string, issuanceId: string): Disposition {
  return { kind: 'COMPLETE', code, matchedIssuanceId: issuanceId };
}

function bindingFrom(row: BoundIssuance, job: ClaimedMercadoPagoWebhook): LivePixWebhookBinding {
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

function matchesBinding(row: BoundIssuance | null, binding: LivePixWebhookBinding): row is BoundIssuance {
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

function verifiedForJob(
  payment: VerifiedProviderPayment,
  binding: LivePixWebhookBinding,
  job: ClaimedMercadoPagoWebhook,
): boolean {
  try {
    assertVerifiedProviderPayment(payment, new Date());
  } catch {
    return false;
  }

  return payment.provider === 'mercado-pago' &&
    payment.liveMode === true &&
    payment.eventId === job.deliveryKey &&
    payment.externalAccountId === binding.accountId &&
    payment.externalPaymentId === binding.paymentId &&
    payment.amountInCents === binding.amountInCents &&
    payment.currency === 'brl';
}

@Injectable()
export class PrismaMercadoPagoLiveWebhookRepository extends MercadoPagoLiveWebhookRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: MercadoPagoConnectionRuntime,
  ) {
    super();
  }

  async enqueue(notice: MercadoPagoWebhookNotice): Promise<void> {
    await this.prisma.mercadoPagoLiveWebhookEvent.createMany({
      data: [notice],
      skipDuplicates: true,
    });
  }

  async claim(clientId: string, leaseToken: string): Promise<ClaimedMercadoPagoWebhook | null> {
    const rows = await this.prisma.$queryRaw<ClaimedMercadoPagoWebhook[]>`
      WITH candidate AS (
        SELECT "clientId", "deliveryKey"
        FROM "MercadoPagoLiveWebhookEvent"
        WHERE "clientId" = ${clientId}
          AND "processedAt" IS NULL AND "reviewRequiredAt" IS NULL
          AND "nextAttemptAt" <= clock_timestamp()
          AND ("leaseToken" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
        ORDER BY "nextAttemptAt", "deliveryKey"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "MercadoPagoLiveWebhookEvent" AS event
      SET "leaseToken" = ${leaseToken}::uuid,
          "leaseExpiresAt" = clock_timestamp() + INTERVAL '2 minutes'
      FROM candidate
      WHERE event."clientId" = candidate."clientId"
        AND event."deliveryKey" = candidate."deliveryKey"
      RETURNING event."clientId", event."deliveryKey", event."paymentId", event."leaseToken", event."attempts"
    `;

    return rows[0] ?? null;
  }

  async prepare(job: ClaimedMercadoPagoWebhook): Promise<LiveWebhookPreparation> {
    if (!this.runtime.liveMode || this.runtime.client === null || this.runtime.clientId !== job.clientId) {
      return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
    }

    // Derive seller and organization only from a previously verified live
    // reservation/charge pair. Never search across other sellers' tokens.
    const found = await this.find(this.prisma, job);
    if (found === null) return { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' };
    const binding = bindingFrom(found, job);
    if (!matchesBinding(found, binding)) return { kind: 'REVIEW', code: 'INVALID_BINDING' };

    return organizationTransaction<LiveWebhookPreparation>(
      this.prisma,
      binding.organizationId,
      'read',
      async (db) => {
        const current = await this.find(db, job);
        if (!matchesBinding(current, binding)) return { kind: 'REVIEW', code: 'INVALID_BINDING' };

        if (!(await this.originalOwner(db, binding))) return { kind: 'OWNER_CHANGED', binding };

        const connection = await this.currentConnection(db, binding);
        if (connection === null || connection.accessTokenCiphertext === null) {
          return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
        }

        return {
          kind: 'READY',
          binding,
          stamp: { connectedAt: connection.connectedAt, updatedAt: connection.updatedAt },
          accessToken: this.runtime.cipher.open(
            ['credential', binding.organizationId, binding.clientId, 'true', binding.accountId, 'access'],
            connection.accessTokenCiphertext,
          ),
        };
      },
      this.errors(),
    );
  }

  async settle(job: ClaimedMercadoPagoWebhook, outcome: LiveWebhookOutcome): Promise<boolean> {
    if (outcome.kind === 'RETRY') return this.finish(this.prisma, job, retry(outcome.code));
    if (outcome.kind === 'REVIEW') return this.finish(this.prisma, job, review(outcome.code));

    const { binding } = outcome;
    if (
      !this.runtime.liveMode ||
      this.runtime.client === null ||
      this.runtime.clientId !== job.clientId ||
      binding.clientId !== job.clientId ||
      binding.paymentId !== job.paymentId
    ) {
      return this.finish(this.prisma, job, review('INVALID_BINDING'));
    }

    try {
      return await organizationTransaction(
        this.prisma,
        binding.organizationId,
        'write',
        async (db) => {
          // Acquire the current lease row before ledger writes. A stale lease
          // cannot settle, and a concurrent claim cannot pass this row lock.
          const rows = await db.$queryRaw<Array<{ deliveryKey: string }>>`
            SELECT "deliveryKey" FROM "MercadoPagoLiveWebhookEvent"
            WHERE "clientId" = ${job.clientId} AND "deliveryKey" = ${job.deliveryKey}
              AND "paymentId" = ${job.paymentId} AND "leaseToken" = ${job.leaseToken}::uuid
              AND "leaseExpiresAt" > clock_timestamp()
              AND "processedAt" IS NULL AND "reviewRequiredAt" IS NULL
            FOR UPDATE
          `;
          if (rows.length !== 1) return false;

          const row = await this.find(db, job);
          let disposition: Disposition;

          if (!matchesBinding(row, binding)) {
            disposition = review('INVALID_BINDING');
          } else if (!(await this.originalOwner(db, binding))) {
            disposition = await this.markReview(db, row, 'OWNER_CHANGED');
          } else if (outcome.kind === 'OWNER_CHANGED') {
            disposition = retry('CONNECTION_CHANGED');
          } else {
            const connection = await this.currentConnection(db, binding);
            if (
              connection === null ||
              connection.connectedAt.getTime() !== outcome.stamp.connectedAt.getTime() ||
              connection.updatedAt.getTime() !== outcome.stamp.updatedAt.getTime()
            ) {
              disposition = retry('CONNECTION_CHANGED');
            } else {
              disposition = await this.applyObservation(db, row, binding, job, outcome.observation);
            }
          }

          // If the lease expires before finalization, throw to roll back the
          // event, issuance, provider-charge and ledger mutations together.
          if (!(await this.finish(db, job, disposition))) throw new LeaseLost();
          return true;
        },
        this.errors(),
      );
    } catch (error: unknown) {
      if (error instanceof LeaseLost) return false;
      throw error;
    }
  }

  private async applyObservation(
    db: Prisma.TransactionClient,
    row: BoundIssuance,
    binding: LivePixWebhookBinding,
    job: ClaimedMercadoPagoWebhook,
    observation: Extract<LiveWebhookOutcome, { kind: 'CHECKED' }>['observation'],
  ): Promise<Disposition> {
    if (observation.status === 'REFUNDED') return this.markReview(db, row, 'VERIFIED_REFUNDED');
    if (observation.status === 'INVALID_PROVIDER_PAYMENT') return this.markReview(db, row, 'INVALID_PROVIDER_PAYMENT');
    if (observation.status === 'REVIEW_REQUIRED') return this.markReview(db, row, 'VERIFIED_REVIEW_REQUIRED');

    // Review is sticky. In particular, an older approved lookup must never
    // apply after a refund, mismatch or authorization change was observed.
    if (
      row.settlementReviewCode !== null ||
      row.resultCode === 'SNAPSHOT_CHANGED' ||
      row.resultCode === 'BINDING_CONFLICT' ||
      row.resultCode === 'UNCERTAIN_CREATION' ||
      row.status === 'RESERVED'
    ) {
      return this.markReview(db, row, 'ISSUANCE_REVIEW_REQUIRED');
    }

    if (observation.status === 'PENDING') {
      // Out-of-order pending events never reopen a terminal issuance.
      return complete('VERIFIED_PENDING', row.id);
    }

    if (observation.status === 'CLOSED') {
      if (row.providerCharge?.paymentId !== null || row.status === 'SETTLED') {
        return this.markReview(db, row, 'CLOSED_AFTER_SETTLEMENT');
      }

      await db.mercadoPagoLivePix.update({
        where: { id: row.id },
        data: { status: 'CLOSED', copyAndPasteCiphertext: null, expiresAt: null },
      });
      return complete('VERIFIED_CLOSED', row.id);
    }

    if (observation.status !== 'APPROVED' || !verifiedForJob(observation.payment, binding, job)) {
      return this.markReview(db, row, 'INVALID_PROVIDER_PAYMENT');
    }

    if (row.status === 'CLOSED') return this.markReview(db, row, 'APPROVAL_AFTER_CLOSURE');

    const result = await confirmRegisteredProviderPayment(
      db,
      { id: row.id, organizationId: binding.organizationId },
      observation.payment,
    );

    if (result !== 'APPLIED' && result !== 'DUPLICATE') {
      return this.markReview(db, row, 'LEDGER_' + result);
    }

    await db.mercadoPagoLivePix.update({
      where: { id: row.id },
      data: { status: 'SETTLED', copyAndPasteCiphertext: null, expiresAt: null },
    });

    return complete('LEDGER_' + result, row.id);
  }

  private async markReview(db: Prisma.TransactionClient, row: BoundIssuance, code: string): Promise<Disposition> {
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

  private find(db: Db, job: ClaimedMercadoPagoWebhook) {
    return db.mercadoPagoLivePix.findUnique({
      where: { clientId_externalPaymentId: { clientId: job.clientId, externalPaymentId: job.paymentId } },
      include: { providerCharge: true },
    });
  }

  private async originalOwner(db: Prisma.TransactionClient, binding: LivePixWebhookBinding): Promise<boolean> {
    const organization = await db.organization.findUnique({
      where: { id: binding.organizationId },
      select: { ownerId: true },
    });
    return organization?.ownerId === binding.ownerId;
  }

  private async currentConnection(db: Prisma.TransactionClient, binding: LivePixWebhookBinding) {
    if (!this.runtime.liveMode || this.runtime.client === null || this.runtime.clientId !== binding.clientId) return null;
    const row = await db.mercadoPagoConnection.findUnique({
      where: { organizationId_liveMode: { organizationId: binding.organizationId, liveMode: true } },
    });
    const oauth = await db.mercadoPagoOAuthAttempt.findUnique({
      where: { organizationId: binding.organizationId },
      select: { liveMode: true, expiresAt: true },
    });
    const now = new Date();
    const decision = decideMercadoPagoCredentialAccess(
      row,
      { ownerId: binding.ownerId, clientId: binding.clientId, liveMode: true },
      oauth !== null && oauth.liveMode && oauth.expiresAt > now,
      now,
    );

    // A settled payment must still be accounted for after subscription expiry.
    // No fabricated owner session or autonomous refresh grant is used here.
    return row !== null && row.accountId === binding.accountId && decision === 'REUSE' ? row : null;
  }

  private async finish(db: Db, job: ClaimedMercadoPagoWebhook, disposition: Disposition): Promise<boolean> {
    const reviewRequired = disposition.kind === 'REVIEW' ||
      (disposition.kind === 'RETRY' && job.attempts + 1 >= MERCADO_PAGO_WEBHOOK_MAX_ATTEMPTS);
    const processed = disposition.kind === 'COMPLETE';
    const delay = mercadoPagoWebhookRetryDelaySeconds(job.attempts);
    const count = await db.$executeRaw`
      UPDATE "MercadoPagoLiveWebhookEvent"
      SET "attempts" = "attempts" + 1,
          "leaseToken" = NULL,
          "leaseExpiresAt" = NULL,
          "processedAt" = CASE WHEN ${processed} THEN clock_timestamp() ELSE NULL END,
          "reviewRequiredAt" = CASE WHEN ${reviewRequired} THEN clock_timestamp() ELSE NULL END,
          "resultCode" = ${disposition.code},
          "matchedIssuanceId" = ${disposition.matchedIssuanceId}::uuid,
          "nextAttemptAt" = clock_timestamp() + ${delay} * INTERVAL '1 second'
      WHERE "clientId" = ${job.clientId} AND "deliveryKey" = ${job.deliveryKey}
        AND "paymentId" = ${job.paymentId} AND "leaseToken" = ${job.leaseToken}::uuid
        AND "leaseExpiresAt" > clock_timestamp()
        AND "processedAt" IS NULL AND "reviewRequiredAt" IS NULL
    `;

    return count === 1;
  }

  private errors() {
    return {
      notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
    };
  }
}

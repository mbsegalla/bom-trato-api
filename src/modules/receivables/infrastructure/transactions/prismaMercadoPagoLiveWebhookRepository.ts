import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { MercadoPagoLiveWebhookRepository } from '../../application/ports/mercadoPagoLiveWebhookRepository.port.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { decideMercadoPagoCredentialAccess, MERCADO_PAGO_REFRESH_MARGIN_MS } from '../../domain/policies/mercadoPagoRefresh.policy.js';
import {
  MERCADO_PAGO_WEBHOOK_MAX_ATTEMPTS,
  mercadoPagoWebhookRetryDelaySeconds,
} from '../../domain/policies/mercadoPagoWebhookRetry.policy.js';
import type {
  LivePixWebhookBinding,
  LiveWebhookOutcome,
  LiveWebhookPreparation,
} from '../../domain/types/mercadoPagoLiveWebhook.types.js';
import type {
  ClaimedMercadoPagoWebhook,
  MercadoPagoWebhookNotice,
} from '../../domain/types/mercadoPagoWebhook.types.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

import { applyLivePixObservation, bindingFrom, markLivePixReview, matchesBinding, retry, review } from './mercadoPagoLiveSettlement.js';
import type { Disposition } from './mercadoPagoLiveSettlement.js';

type Db = Prisma.TransactionClient | PrismaService;

class LeaseLost extends Error {}

interface LiveRefreshClaim {
  kind: 'ROTATE';
  binding: LivePixWebhookBinding;
  claimId: string;
  connectedAt: Date;
  refreshToken: string;
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
    const prepared = await this.prepareCredential(job, true);
    if (prepared.kind !== 'ROTATE') return prepared;

    if (!(await this.rotateCredential(job, prepared))) {
      return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
    }

    // Re-read the complete binding, lease and connection stamp after rotation.
    const fresh = await this.prepareCredential(job, false);
    return fresh.kind === 'ROTATE' ? { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' } : fresh;
  }

  private async prepareCredential(
    job: ClaimedMercadoPagoWebhook,
    allowRotation: boolean,
  ): Promise<LiveWebhookPreparation | LiveRefreshClaim> {
    if (!this.runtime.liveMode || this.runtime.client === null || this.runtime.clientId !== job.clientId) {
      return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
    }

    // Derive seller and organization only from a previously verified live
    // reservation/charge pair. Never search across other sellers' tokens.
    const found = await this.find(this.prisma, job);
    if (found === null) return { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' };
    const binding = bindingFrom(found, job);
    if (!matchesBinding(found, binding)) return { kind: 'REVIEW', code: 'INVALID_BINDING' };

    return organizationTransaction<LiveWebhookPreparation | LiveRefreshClaim>(
      this.prisma,
      binding.organizationId,
      'write',
      async (db) => {
        if (!(await this.leaseCurrent(db, job))) {
          return { kind: 'RETRY', code: 'PROCESSING_FAILED' };
        }

        const current = await this.find(db, job);
        if (!matchesBinding(current, binding)) return { kind: 'REVIEW', code: 'INVALID_BINDING' };

        if (!(await this.originalOwner(db, binding))) return { kind: 'OWNER_CHANGED', binding };

        const connection = await this.credentialCandidate(db, binding);
        if (connection === null || connection.accessTokenCiphertext === null) {
          return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
        }

        if (connection.decision === 'ROTATE') {
          // The provider originally returned offline_access. Only renew a
          // still-valid grant for a leased, exactly bound live payment, never
          // for unknown IDs or unrelated sellers. Subscription expiry alone
          // does not stop collecting evidence of money already paid.
          const now = new Date();
          if (!allowRotation || connection.expiresAt === null || connection.expiresAt <= now ||
            connection.refreshTokenCiphertext === null || !(await this.rotationAuthorized(db, binding))) {
            return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
          }

          const claimId = randomUUID();
          const refreshToken = this.runtime.cipher.open(
            ['credential', binding.organizationId, binding.clientId, 'true', binding.accountId, 'refresh'],
            connection.refreshTokenCiphertext,
          );
          await db.mercadoPagoConnection.update({
            where: { organizationId_liveMode: { organizationId: binding.organizationId, liveMode: true } },
            data: { refreshClaimId: claimId, refreshStartedAt: now },
          });
          return { kind: 'ROTATE', binding, claimId, connectedAt: connection.connectedAt, refreshToken };
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
            disposition = await markLivePixReview(db, row, 'OWNER_CHANGED');
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
              disposition = await applyLivePixObservation(db, row, binding, job.deliveryKey, outcome.observation);
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

  private async leaseCurrent(db: Prisma.TransactionClient, job: ClaimedMercadoPagoWebhook): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ deliveryKey: string }>>`
      SELECT "deliveryKey" FROM "MercadoPagoLiveWebhookEvent"
      WHERE "clientId" = ${job.clientId} AND "deliveryKey" = ${job.deliveryKey}
        AND "paymentId" = ${job.paymentId} AND "leaseToken" = ${job.leaseToken}::uuid
        AND "leaseExpiresAt" > clock_timestamp()
        AND "processedAt" IS NULL AND "reviewRequiredAt" IS NULL
      FOR SHARE
    `;
    return rows.length === 1;
  }

  private async rotationAuthorized(db: Prisma.TransactionClient, binding: LivePixWebhookBinding): Promise<boolean> {
    if (!(await this.originalOwner(db, binding))) return false;
    const member = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: binding.organizationId, userId: binding.ownerId } },
      select: { role: true, user: { select: { disabledAt: true, emailVerifiedAt: true } } },
    });
    return member?.role === 'OWNER' && member.user.disabledAt === null && member.user.emailVerifiedAt !== null;
  }

  private async rotateCredential(job: ClaimedMercadoPagoWebhook, claim: LiveRefreshClaim): Promise<boolean> {
    const { binding } = claim;
    const client = this.runtime.client;
    if (client === null || !this.runtime.liveMode || this.runtime.clientId !== binding.clientId) return false;

    // No provider I/O occurs inside a retryable database transaction. A
    // timeout may consume the grant; keep the durable claim on any failure.
    const renewed = await client.refreshCredentials(binding.accountId, claim.refreshToken).catch(() => null);
    if (renewed === null || renewed.liveMode !== true || renewed.accountId !== binding.accountId ||
      renewed.expiresAt.getTime() <= Date.now() + MERCADO_PAGO_REFRESH_MARGIN_MS) return false;

    return organizationTransaction(
      this.prisma,
      binding.organizationId,
      'write',
      async (db) => {
        const row = await this.find(db, job);
        if (!matchesBinding(row, binding) || !(await this.rotationAuthorized(db, binding))) return false;
        const oauth = await db.mercadoPagoOAuthAttempt.findUnique({
          where: { organizationId: binding.organizationId },
          select: { liveMode: true, expiresAt: true },
        });
        if (oauth !== null && oauth.liveMode && oauth.expiresAt > new Date()) return false;
        const aad = ['credential', binding.organizationId, binding.clientId, 'true', binding.accountId];
        // If the grant was consumed, preserve its new tokens even if the
        // original event lease expired during I/O. The claim CAS prevents
        // overwriting a disconnect/reconnect or another refresh. A new lease
        // is still required before any payment can be queried or settled.
        const saved = await db.mercadoPagoConnection.updateMany({
          where: {
            organizationId: binding.organizationId, liveMode: true, clientId: binding.clientId,
            accountId: binding.accountId, connectedById: binding.ownerId,
            connectedAt: claim.connectedAt, disconnectedAt: null, refreshClaimId: claim.claimId,
          },
          data: {
            accessTokenCiphertext: this.runtime.cipher.seal([...aad, 'access'], renewed.accessToken),
            refreshTokenCiphertext: this.runtime.cipher.seal([...aad, 'refresh'], renewed.refreshToken),
            expiresAt: renewed.expiresAt, refreshClaimId: null, refreshStartedAt: null,
          },
        });
        return saved.count === 1;
      },
      this.errors(),
    );
  }

  private async currentConnection(db: Prisma.TransactionClient, binding: LivePixWebhookBinding) {
    const row = await this.credentialCandidate(db, binding);
    return row?.decision === 'REUSE' ? row : null;
  }

  private async credentialCandidate(db: Prisma.TransactionClient, binding: LivePixWebhookBinding) {
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

    return row !== null && row.accountId === binding.accountId && decision !== 'RECONNECT_REQUIRED'
      ? { ...row, decision } : null;
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

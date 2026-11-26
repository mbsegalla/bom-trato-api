import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { MercadoPagoWebhookRepository } from '../../application/ports/mercadoPagoWebhookRepository.port.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { decideMercadoPagoCredentialAccess } from '../../domain/policies/mercadoPagoRefresh.policy.js';
import {
  mercadoPagoWebhookDisposition,
  mercadoPagoWebhookRetryDelaySeconds,
} from '../../domain/policies/mercadoPagoWebhookRetry.policy.js';
import type {
  ClaimedMercadoPagoWebhook,
  MercadoPagoWebhookNotice,
  MercadoPagoWebhookOutcome,
  SandboxPixWebhookBinding,
  SandboxPixWebhookPreparation,
} from '../../domain/types/mercadoPagoWebhook.types.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

@Injectable()
export class PrismaMercadoPagoWebhookRepository extends MercadoPagoWebhookRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: MercadoPagoConnectionRuntime,
  ) {
    super();
  }

  async enqueue(notice: MercadoPagoWebhookNotice): Promise<void> {
    await this.prisma.mercadoPagoWebhookEvent.createMany({
      data: [notice],
      skipDuplicates: true,
    });
  }

  async claim(clientId: string, leaseToken: string): Promise<ClaimedMercadoPagoWebhook | null> {
    const rows = await this.prisma.$queryRaw<ClaimedMercadoPagoWebhook[]>`
      WITH candidate AS (
        SELECT "clientId", "deliveryKey"
        FROM "MercadoPagoWebhookEvent"
        WHERE "clientId" = ${clientId}
          AND "processedAt" IS NULL
          AND "reviewRequiredAt" IS NULL
          AND "nextAttemptAt" <= clock_timestamp()
          AND ("leaseToken" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
        ORDER BY "nextAttemptAt", "deliveryKey"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "MercadoPagoWebhookEvent" AS event
      SET "leaseToken" = ${leaseToken}::uuid,
          "leaseExpiresAt" = clock_timestamp() + INTERVAL '2 minutes'
      FROM candidate
      WHERE event."clientId" = candidate."clientId"
        AND event."deliveryKey" = candidate."deliveryKey"
      RETURNING event."clientId", event."deliveryKey", event."paymentId", event."leaseToken", event."attempts"
    `;

    return rows[0] ?? null;
  }

  async prepare(job: ClaimedMercadoPagoWebhook): Promise<SandboxPixWebhookPreparation> {
    if (this.runtime.liveMode || this.runtime.client === null || this.runtime.clientId !== job.clientId) {
      return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
    }

    // The notification supplies only the signed payment ID. Never choose a
    // seller from its body or try arbitrary organization tokens.
    const matches = await this.prisma.mercadoPagoSandboxPix.findMany({
      where: { clientId: job.clientId, externalPaymentId: job.paymentId },
      select: { id: true, organizationId: true, issuedById: true, accountId: true, amountInCents: true },
      take: 2,
    });

    if (matches.length > 1) return { kind: 'REVIEW', code: 'AMBIGUOUS_PAYMENT' };
    const row = matches[0];
    if (!row) return { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' };

    const binding: SandboxPixWebhookBinding = {
      issuanceId: row.id,
      organizationId: row.organizationId,
      ownerId: row.issuedById,
      clientId: job.clientId,
      accountId: row.accountId,
      paymentId: job.paymentId,
      amountInCents: row.amountInCents,
    };

    return organizationTransaction<SandboxPixWebhookPreparation>(
      this.prisma,
      binding.organizationId,
      'read',
      async (db) => {
        const connection = await this.currentConnection(db, binding);

        if (connection === null || connection.accessTokenCiphertext === null) {
          return { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' };
        }

        // No synthetic user session and no refresh grant in the worker. A
        // reconnect/owner-authorized rotation can restore an expired token.
        const accessToken = this.runtime.cipher.open(
          ['credential', binding.organizationId, binding.clientId, 'false', binding.accountId, 'access'],
          connection.accessTokenCiphertext,
        );

        return { kind: 'READY', access: { binding, connectedAt: connection.connectedAt, accessToken } };
      },
      this.errors(),
    );
  }

  async settle(job: ClaimedMercadoPagoWebhook, outcome: MercadoPagoWebhookOutcome): Promise<boolean> {
    if (outcome.kind !== 'CHECKED') {
      return this.settleRow(this.prisma, job, outcome);
    }

    const { binding, connectedAt, status } = outcome;

    if (binding.clientId !== job.clientId || binding.paymentId !== job.paymentId) {
      return this.settleRow(this.prisma, job, { kind: 'REVIEW', code: 'INVALID_PROVIDER_PAYMENT' });
    }

    return organizationTransaction(
      this.prisma,
      binding.organizationId,
      'write',
      async (db) => {
        const connection = await this.currentConnection(db, binding);

        if (connection === null || connection.connectedAt.getTime() !== connectedAt.getTime()) {
          return this.settleRow(db, job, { kind: 'RETRY', code: 'CONNECTION_CHANGED' });
        }

        // Recheck the bound identity under the organization lock and never
        // authorize a second issuance, even if the provider reports closure.
        const current = await db.mercadoPagoSandboxPix.findFirst({
          where: this.bindingWhere(binding),
          select: { id: true },
        });

        if (current === null) {
          return this.settleRow(db, job, { kind: 'REVIEW', code: 'INVALID_PROVIDER_PAYMENT' });
        }

        // Finalization and any QR invalidation share one database transaction.
        // An expired or replaced lease is never allowed to modify the issuance.
        if (!(await this.settleRow(db, job, outcome))) {
          return false;
        }

        if (status !== 'PENDING') {
          await db.mercadoPagoSandboxPix.updateMany({
            where: { ...this.bindingWhere(binding), status: 'PENDING' },
            data: { status: 'REVIEW_REQUIRED', copyAndPasteCiphertext: null, expiresAt: null },
          });
        }

        // A later pending/out-of-order delivery cannot restore a QR or undo
        // a review. No Receivable or ReceivablePayment writes exist here.
        return true;
      },
      this.errors(),
    );
  }

  private bindingWhere(binding: SandboxPixWebhookBinding) {
    return {
      id: binding.issuanceId,
      organizationId: binding.organizationId,
      issuedById: binding.ownerId,
      clientId: binding.clientId,
      accountId: binding.accountId,
      externalPaymentId: binding.paymentId,
      amountInCents: binding.amountInCents,
    };
  }

  private async currentConnection(db: Prisma.TransactionClient, binding: SandboxPixWebhookBinding) {
    if (this.runtime.liveMode || this.runtime.client === null || this.runtime.clientId !== binding.clientId) {
      return null;
    }

    try {
      await assertReceivingSettingsOwner(db, { organizationId: binding.organizationId, userId: binding.ownerId }, false);
    } catch (error: unknown) {
      if (error instanceof ReceivingSettingsError) return null;
      throw error;
    }

    const connection = await db.mercadoPagoConnection.findUnique({
      where: { organizationId_liveMode: { organizationId: binding.organizationId, liveMode: false } },
    });
    const attempt = await db.mercadoPagoOAuthAttempt.findUnique({
      where: { organizationId: binding.organizationId },
      select: { liveMode: true, expiresAt: true },
    });
    const now = new Date();
    const oauthInProgress = attempt !== null && !attempt.liveMode && attempt.expiresAt > now;
    const decision = decideMercadoPagoCredentialAccess(
      connection,
      { ownerId: binding.ownerId, clientId: binding.clientId, liveMode: false },
      oauthInProgress,
      now,
    );

    return connection !== null && connection.accountId === binding.accountId && decision === 'REUSE'
      ? connection
      : null;
  }

  private async settleRow(
    db: Prisma.TransactionClient | PrismaService,
    job: ClaimedMercadoPagoWebhook,
    outcome: MercadoPagoWebhookOutcome,
  ): Promise<boolean> {
    const disposition = mercadoPagoWebhookDisposition(outcome, job.attempts);
    const delay = mercadoPagoWebhookRetryDelaySeconds(job.attempts);
    const count = await db.$executeRaw`
      UPDATE "MercadoPagoWebhookEvent"
      SET "attempts" = "attempts" + 1,
          "leaseToken" = NULL,
          "leaseExpiresAt" = NULL,
          "processedAt" = CASE WHEN ${disposition.complete} THEN clock_timestamp() ELSE NULL END,
          "reviewRequiredAt" = CASE WHEN ${disposition.review} THEN clock_timestamp() ELSE NULL END,
          "resultCode" = ${disposition.code},
          "matchedIssuanceId" = ${disposition.matchedIssuanceId}::uuid,
          "nextAttemptAt" = clock_timestamp() + ${delay} * INTERVAL '1 second'
      WHERE "clientId" = ${job.clientId}
        AND "deliveryKey" = ${job.deliveryKey}
        AND "paymentId" = ${job.paymentId}
        AND "leaseToken" = ${job.leaseToken}::uuid
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

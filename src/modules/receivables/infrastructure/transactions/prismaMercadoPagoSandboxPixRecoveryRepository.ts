import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { MercadoPagoSandboxPixRecoveryRepository } from '../../application/ports/mercadoPagoSandboxPixRecoveryRepository.port.js';
import type { MercadoPagoSandboxPixActor } from '../../application/types/mercadoPagoSandboxPix.types.js';
import type {
  MercadoPagoSandboxPixRecoveryView,
  RecoverMercadoPagoSandboxPixInput,
  SandboxPixRecoveryStatus,
  SandboxPixVerifiedStatus,
} from '../../application/types/mercadoPagoSandboxPixRecovery.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { decideMercadoPagoCredentialAccess } from '../../domain/policies/mercadoPagoRefresh.policy.js';
import {
  isSandboxVerifiedStatus,
  SANDBOX_RECOVERY_LEASE_MS,
  sandboxRecoveryNextAt,
  sandboxRecoveryViewStatus,
} from '../../domain/policies/mercadoPagoSandboxPixRecovery.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { MercadoPagoError } from '../providers/mercadoPago/mercadoPagoClient.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

import { MercadoPagoCredentialService } from './mercadoPagoCredentialService.js';

interface RecoveryBinding {
  id: string;
  organizationId: string;
  receivableId: string;
  issuedById: string;
  clientId: string;
  accountId: string;
  externalPaymentId: string | null;
  amountInCents: number;
}

interface RecoveryClaim {
  attemptId: string;
  binding: RecoveryBinding;
  connectedAt: Date;
}

type RecoveryResult =
  | { status: SandboxPixVerifiedStatus; paymentId: string }
  | { status: Exclude<SandboxPixRecoveryStatus, SandboxPixVerifiedStatus | 'IN_PROGRESS' | 'ABANDONED'>; paymentId: null };

function conflict(): never {
  throw new ReceivingSettingsError('MERCADO_PAGO_PIX_CONFLICT');
}

@Injectable()
export class PrismaMercadoPagoSandboxPixRecoveryRepository extends MercadoPagoSandboxPixRecoveryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: MercadoPagoConnectionRuntime,
    private readonly credentials: MercadoPagoCredentialService,
  ) {
    super();
  }

  read(actor: MercadoPagoSandboxPixActor): Promise<MercadoPagoSandboxPixRecoveryView> {
    return organizationTransaction(
      this.prisma,
      actor.organizationId,
      'read',
      async (db) => {
        const access = await assertReceivingSettingsOwner(db, actor, false);
        const row = await this.issuance(db, actor);
        const empty: MercadoPagoSandboxPixRecoveryView = {
          organizationId: actor.organizationId,
          receivableId: actor.receivableId,
          issuanceId: null,
          canRecover: false,
          nextRecoveryAt: null,
          lastAttempt: null,
          lastWebhook: null,
        };

        if (row === null || row.issuedById !== actor.userId) return empty;

        const latest = await this.latest(db, row.id);
        const now = new Date();
        const next = sandboxRecoveryNextAt(row, latest);
        const connection = await this.currentConnection(db, actor, row, now);
        const webhook = row.externalPaymentId === null ? null : await db.mercadoPagoWebhookEvent.findFirst({
          where: {
            clientId: row.clientId,
            paymentId: row.externalPaymentId,
            matchedIssuanceId: row.id,
            OR: [{ processedAt: { not: null } }, { reviewRequiredAt: { not: null } }],
          },
          orderBy: [{ receivedAt: 'desc' }, { deliveryKey: 'desc' }],
          select: { resultCode: true, receivedAt: true },
        });

        return {
          ...empty,
          issuanceId: row.id,
          canRecover: connection !== null && access.hasPlatformAccess && !access.billingNeedsReconciliation && next <= now,
          nextRecoveryAt: next > now ? next : null,
          lastAttempt: latest === null ? null : {
            status: sandboxRecoveryViewStatus(latest, now),
            startedAt: latest.startedAt,
            completedAt: latest.completedAt,
            paymentId: latest.paymentId,
          },
          lastWebhook: webhook !== null && isSandboxVerifiedStatus(webhook.resultCode)
            ? { status: webhook.resultCode, receivedAt: webhook.receivedAt }
            : null,
        };
      },
      this.errors(),
    );
  }

  async recover(
    actor: MercadoPagoSandboxPixActor,
    input: RecoverMercadoPagoSandboxPixInput,
  ): Promise<MercadoPagoSandboxPixRecoveryView> {
    const view = await this.read(actor);

    if (!view.canRecover || view.issuanceId !== input.issuanceId) return conflict();

    const { client } = this.runtime.requireEnabled();
    const access = await this.credentials.accessForOwner(actor);

    if (access.liveMode || !this.runtime.sandboxPixAvailable) return conflict();

    // Commit an owner-authorized audit claim before any search/read at the provider.
    const claim = await organizationTransaction<RecoveryClaim>(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, true);
        const now = new Date();
        if (!(await this.sessionCurrent(db, actor, now))) return conflict();
        const row = await this.issuance(db, actor);

        if (row === null || row.id !== input.issuanceId || row.issuedById !== actor.userId || row.accountId !== access.accountId) {
          return conflict();
        }

        const latest = await this.latest(db, row.id);
        if (sandboxRecoveryNextAt(row, latest) > now) return conflict();

        const connection = await this.currentConnection(db, actor, row, now);
        if (connection === null || connection.accessTokenCiphertext === null || connection.decision !== 'REUSE') return conflict();

        const currentToken = this.runtime.cipher.open(
          ['credential', row.organizationId, row.clientId, 'false', row.accountId, 'access'],
          connection.accessTokenCiphertext,
        );
        if (currentToken !== access.accessToken) return conflict();

        await db.mercadoPagoSandboxPixRecovery.updateMany({
          where: { issuanceId: row.id, status: 'IN_PROGRESS', leaseExpiresAt: { lte: now } },
          data: { status: 'ABANDONED', completedAt: now },
        });

        const attempt = await db.mercadoPagoSandboxPixRecovery.create({
          data: {
            id: randomUUID(),
            issuanceId: row.id,
            startedById: actor.userId,
            startedAt: now,
            leaseExpiresAt: new Date(now.getTime() + SANDBOX_RECOVERY_LEASE_MS),
          },
        });

        return {
          attemptId: attempt.id,
          binding: {
            id: row.id,
            organizationId: row.organizationId,
            receivableId: row.receivableId,
            issuedById: row.issuedById,
            clientId: row.clientId,
            accountId: row.accountId,
            externalPaymentId: row.externalPaymentId,
            amountInCents: row.amountInCents,
          },
          connectedAt: connection.connectedAt,
        };
      },
      this.errors(),
    );

    const request = {
      issuanceId: claim.binding.id,
      accountId: claim.binding.accountId,
      amountInCents: claim.binding.amountInCents,
      accessToken: access.accessToken,
    };
    let result: RecoveryResult;

    try {
      const paymentId = claim.binding.externalPaymentId;
      if (paymentId !== null) {
        const status = await client.readSandboxPix({ ...request, paymentId });
        result = { status: `VERIFIED_${status}`, paymentId };
      } else {
        const found = await client.searchSandboxPix(request);
        result = found.kind === 'FOUND'
          ? { status: `VERIFIED_${found.status}`, paymentId: found.paymentId }
          : { status: found.kind, paymentId: null };
      }
    } catch (error: unknown) {
      result = {
        status: error instanceof MercadoPagoError && error.code !== 'REQUEST_FAILED'
          ? 'INVALID_PROVIDER_PAYMENT'
          : 'PROVIDER_UNAVAILABLE',
        paymentId: null,
      };
    }

    try {
      await this.finish(actor, claim, result);
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      // A concurrent external identity binding can fail the unique constraint.
      // The transaction rolled back; keep a review record rather than overwrite.
      await this.finish(actor, claim, { status: 'BINDING_CONFLICT', paymentId: null });
    }

    return this.read(actor);
  }

  private async finish(actor: MercadoPagoSandboxPixActor, claim: RecoveryClaim, result: RecoveryResult): Promise<void> {
    await organizationTransaction(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        const now = new Date();
        const binding = claim.binding;
        const row = await this.issuance(db, actor);
        let outcome = result;
        let authorized = false;

        try {
          await assertReceivingSettingsOwner(db, actor, true);
          authorized = await this.sessionCurrent(db, actor, now);
        } catch (error: unknown) {
          if (!(error instanceof ReceivingSettingsError)) throw error;
        }

        const connection = authorized && row !== null && row.issuedById === actor.userId
          ? await this.currentConnection(db, actor, row, now)
          : null;

        if (
          connection === null ||
          connection.connectedAt.getTime() !== claim.connectedAt.getTime() ||
          row === null ||
          row.id !== binding.id ||
          row.issuedById !== binding.issuedById ||
          row.clientId !== binding.clientId ||
          row.accountId !== binding.accountId ||
          row.amountInCents !== binding.amountInCents ||
          (row.externalPaymentId !== binding.externalPaymentId && row.externalPaymentId !== result.paymentId)
        ) {
          outcome = { status: 'CONNECTION_CHANGED', paymentId: null };
        }

        if (outcome.paymentId !== null) {
          const collision = await db.mercadoPagoSandboxPix.findFirst({
            where: {
              id: { not: binding.id },
              externalPaymentId: outcome.paymentId,
              OR: [{ accountId: binding.accountId }, { clientId: binding.clientId }],
            },
            select: { id: true },
          });

          if (collision !== null) outcome = { status: 'BINDING_CONFLICT', paymentId: null };
        }

        // Compare-and-set the original unexpired claim before touching the issuance.
        const settled = await db.mercadoPagoSandboxPixRecovery.updateMany({
          where: {
            id: claim.attemptId,
            issuanceId: binding.id,
            startedById: actor.userId,
            status: 'IN_PROGRESS',
            leaseExpiresAt: { gt: new Date() },
          },
          data: { status: outcome.status, completedAt: new Date(), paymentId: outcome.paymentId },
        });

        if (settled.count !== 1 || row === null || outcome.status === 'CONNECTION_CHANGED') return;

        const shouldHide = outcome.paymentId !== null
          ? outcome.status !== 'VERIFIED_PENDING' || row.status !== 'PENDING'
          : outcome.status === 'AMBIGUOUS' || outcome.status === 'INVALID_PROVIDER_PAYMENT' || outcome.status === 'BINDING_CONFLICT';

        if (shouldHide) {
          await db.mercadoPagoSandboxPix.updateMany({
            where: { id: binding.id, organizationId: binding.organizationId },
            data: {
              status: 'REVIEW_REQUIRED',
              externalPaymentId: outcome.paymentId ?? row.externalPaymentId,
              copyAndPasteCiphertext: null,
              expiresAt: null,
            },
          });
        }

        // Existing reviewed/expired/uncertain attempts are never reissued or
        // given a replacement QR, even after a verified pending payment.
        // No real ledger or unrelated webhook review record is mutated.
      },
      this.errors(),
    );
  }

  private issuance(db: Prisma.TransactionClient, actor: MercadoPagoSandboxPixActor) {
    return db.mercadoPagoSandboxPix.findUnique({
      where: { receivableId_organizationId: { receivableId: actor.receivableId, organizationId: actor.organizationId } },
    });
  }

  private latest(db: Prisma.TransactionClient, issuanceId: string) {
    return db.mercadoPagoSandboxPixRecovery.findFirst({
      where: { issuanceId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
  }

  private async sessionCurrent(db: Prisma.TransactionClient, actor: MercadoPagoSandboxPixActor, now: Date) {
    const sessions = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AuthSession"
      WHERE "id" = ${actor.sessionId}::uuid
        AND "userId" = ${actor.userId}::uuid
        AND "revokedAt" IS NULL AND "idleExpiresAt" > ${now} AND "absoluteExpiresAt" > ${now}
      FOR SHARE
    `;
    return sessions.length === 1;
  }

  private async currentConnection(
    db: Prisma.TransactionClient,
    actor: MercadoPagoSandboxPixActor,
    binding: RecoveryBinding,
    now: Date,
  ) {
    if (!this.runtime.sandboxPixAvailable || this.runtime.clientId !== binding.clientId) return null;
    const connection = await db.mercadoPagoConnection.findUnique({
      where: { organizationId_liveMode: { organizationId: actor.organizationId, liveMode: false } },
    });
    const attempt = await db.mercadoPagoOAuthAttempt.findUnique({
      where: { organizationId: actor.organizationId },
      select: { liveMode: true, expiresAt: true },
    });
    const decision = decideMercadoPagoCredentialAccess(
      connection,
      { ownerId: actor.userId, clientId: binding.clientId, liveMode: false },
      attempt !== null && !attempt.liveMode && attempt.expiresAt > now,
      now,
    );

    return connection !== null && connection.accountId === binding.accountId && decision !== 'RECONNECT_REQUIRED'
      ? { ...connection, decision }
      : null;
  }

  private errors() {
    return {
      notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
    };
  }
}

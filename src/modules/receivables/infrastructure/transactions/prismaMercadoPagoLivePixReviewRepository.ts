import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { mercadoPagoLiveWebhookConfig } from '../../../../config/mercadoPagoLiveWebhook.config.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { MercadoPagoLivePixReviewRepository } from '../../application/ports/mercadoPagoLivePixReviewRepository.port.js';
import type {
  LivePixViewStatus,
  MercadoPagoLivePixActor,
  MercadoPagoLivePixView,
  RecoverMercadoPagoLivePixInput,
} from '../../application/types/mercadoPagoLivePix.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import {
  LIVE_PIX_RECOVERY_LEASE_MS,
  livePixViewStatus,
  nextLivePixRecoveryAt,
} from '../../domain/policies/mercadoPagoLivePixReview.policy.js';
import { decideMercadoPagoCredentialAccess } from '../../domain/policies/mercadoPagoRefresh.policy.js';
import { isValidSandboxDynamicPix, sandboxPixBalance } from '../../domain/policies/mercadoPagoSandboxPix.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { MercadoPagoError } from '../providers/mercadoPago/mercadoPagoClient.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import type { MercadoPagoLivePaymentObservation } from '../providers/mercadoPago/mercadoPagoPix.types.js';

import { MercadoPagoCredentialService } from './mercadoPagoCredentialService.js';
import { applyLivePixObservation, bindingFrom, markLivePixReview, matchesBinding } from './mercadoPagoLiveSettlement.js';
import type { BoundIssuance } from './mercadoPagoLiveSettlement.js';

type Result =
  | { kind: 'FOUND'; paymentId: string; observation: MercadoPagoLivePaymentObservation }
  | { kind: 'NOT_FOUND' | 'AMBIGUOUS' | 'INVALID_PROVIDER_PAYMENT' | 'PROVIDER_UNAVAILABLE' | 'BINDING_CONFLICT' };

interface RecoveryClaim {
  id: string;
  row: BoundIssuance;
  connectedAt: Date;
  updatedAt: Date;
}

class LeaseLost extends Error {}

function conflict(): never {
  throw new ReceivingSettingsError('MERCADO_PAGO_PIX_CONFLICT');
}

@Injectable()
export class PrismaMercadoPagoLivePixReviewRepository extends MercadoPagoLivePixReviewRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: MercadoPagoConnectionRuntime,
    private readonly credentials: MercadoPagoCredentialService,
    @Inject(mercadoPagoLiveWebhookConfig.KEY)
    private readonly config: ConfigType<typeof mercadoPagoLiveWebhookConfig>,
  ) {
    super();
  }

  private get recoveryEnabled(): boolean {
    return this.config.enabled && this.config.workerEnabled &&
      this.runtime.liveMode && this.runtime.client !== null &&
      this.config.clientId === this.runtime.clientId;
  }

  read(actor: MercadoPagoLivePixActor): Promise<MercadoPagoLivePixView> {
    return organizationTransaction(
      this.prisma,
      actor.organizationId,
      'read',
      async (db) => {
        const access = await assertReceivingSettingsOwner(db, actor, false);
        const receivable = await db.receivable.findFirst({
          where: { id: actor.receivableId, organizationId: actor.organizationId },
          select: { version: true, status: true, currency: true, amountInCents: true, receivedInCents: true },
        });
        if (receivable === null) throw new ReceivingSettingsError('RECEIVABLE_NOT_FOUND');

        const row = await this.find(db, actor);
        if (row !== null && row.issuedById !== actor.userId) return conflict();

        const now = new Date();
        const available = this.runtime.liveMode && this.runtime.client !== null;
        const connection = await this.currentConnection(db, actor, row, now);
        const operating = access.hasPlatformAccess && !access.billingNeedsReconciliation;
        const bindingValid = row !== null && row.externalPaymentId !== null &&
          matchesBinding(row, bindingFrom(row, { clientId: row.clientId, paymentId: row.externalPaymentId }));
        const canPresent = this.runtime.livePixAvailable && this.recoveryEnabled && operating &&
          connection !== null && connection.decision === 'REUSE' && bindingValid &&
          row !== null && row.providerCharge !== null && row.providerCharge.reviewReason === null &&
          row.providerCharge.paymentId === null;
        let status: LivePixViewStatus = livePixViewStatus(row, receivable, canPresent, now);
        let copyAndPaste: string | null = null;
        if (status === 'PENDING' && row !== null && row.copyAndPasteCiphertext !== null) {
          try {
            const code = this.runtime.cipher.open(
              ['live-pix', row.organizationId, row.clientId, row.accountId, row.id],
              row.copyAndPasteCiphertext,
            );
            if (isValidSandboxDynamicPix(code, row.amountInCents)) copyAndPaste = code;
          } catch {
            // Failed decryption must never expose a stale or corrupt code.
          }
        }
        if (status === 'PENDING' && copyAndPaste === null) status = 'REVIEW_REQUIRED';

        const latest = row === null ? null : await this.latest(db, row.id);
        const next = row === null ? null : nextLivePixRecoveryAt(row, latest);
        const event = row === null ? null : await db.mercadoPagoLiveWebhookEvent.findFirst({
          where: { clientId: row.clientId, matchedIssuanceId: row.id },
          orderBy: [{ receivedAt: 'desc' }, { deliveryKey: 'desc' }],
          select: { resultCode: true },
        });
        const priorCharge = row === null ? await db.receivableProviderCharge.findFirst({
          where: { organizationId: actor.organizationId, receivableId: actor.receivableId },
          select: { id: true },
        }) : null;

        return {
          organizationId: actor.organizationId,
          receivableId: actor.receivableId,
          receivableVersion: receivable.version,
          available,
          canIssue: row === null && priorCharge === null && this.runtime.livePixAvailable &&
            this.recoveryEnabled && operating && connection !== null && sandboxPixBalance(receivable) > 0,
          canRecover: row !== null && this.recoveryEnabled && operating && connection !== null &&
            next !== null && next <= now,
          status,
          issuanceId: row?.id ?? null,
          amountInCents: row?.amountInCents ?? null,
          paymentId: row?.externalPaymentId ?? null,
          expiresAt: status === 'PENDING' ? row?.expiresAt ?? null : null,
          copyAndPaste,
          reviewCode: row?.settlementReviewCode ?? (status === 'REVIEW_REQUIRED' ? row?.resultCode ?? null : null),
          lastRecoveryCode: latest?.resultCode === 'IN_PROGRESS' && latest.leaseExpiresAt <= now
            ? 'ABANDONED' : latest?.resultCode ?? null,
          nextRecoveryAt: next !== null && next > now ? next : null,
          lastWebhookCode: event?.resultCode ?? null,
          liveMode: true,
        };
      },
      this.errors(),
    );
  }

  async recover(actor: MercadoPagoLivePixActor, input: RecoverMercadoPagoLivePixInput): Promise<MercadoPagoLivePixView> {
    const view = await this.read(actor);
    if (!view.canRecover || view.issuanceId !== input.issuanceId) return conflict();

    const { client } = this.runtime.requireEnabled();
    const access = await this.credentials.accessForOwner(actor);
    if (!access.liveMode || !this.recoveryEnabled) return conflict();

    const claim = await organizationTransaction<RecoveryClaim>(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, true);
        const now = new Date();
        if (!(await this.sessionCurrent(db, actor, now))) return conflict();
        const row = await this.find(db, actor);
        if (row === null || row.id !== input.issuanceId || row.issuedById !== actor.userId || row.accountId !== access.accountId) {
          return conflict();
        }

        if (nextLivePixRecoveryAt(row, await this.latest(db, row.id)) > now) return conflict();
        const connection = await this.currentConnection(db, actor, row, now);
        if (connection === null || connection.decision !== 'REUSE' || connection.accessTokenCiphertext === null) return conflict();

        const token = this.runtime.cipher.open(
          ['credential', row.organizationId, row.clientId, 'true', row.accountId, 'access'],
          connection.accessTokenCiphertext,
        );
        if (token !== access.accessToken) return conflict();

        await db.mercadoPagoLivePixRecovery.updateMany({
          where: { issuanceId: row.id, resultCode: 'IN_PROGRESS', leaseExpiresAt: { lte: now } },
          data: { resultCode: 'ABANDONED', completedAt: now },
        });
        const attempt = await db.mercadoPagoLivePixRecovery.create({
          data: {
            id: randomUUID(), issuanceId: row.id, startedById: actor.userId, startedAt: now,
            leaseExpiresAt: new Date(now.getTime() + LIVE_PIX_RECOVERY_LEASE_MS),
          },
        });
        return { id: attempt.id, row, connectedAt: connection.connectedAt, updatedAt: connection.updatedAt };
      },
      this.errors(),
    );

    const request = {
      issuanceId: claim.row.id,
      accountId: claim.row.accountId,
      amountInCents: claim.row.amountInCents,
      accessToken: access.accessToken,
      eventId: 'recovery-' + claim.id,
    };

    let result: Result;
    try {
      if (claim.row.externalPaymentId === null) {
        result = await client.searchLivePix(request);
      } else {
        result = {
          kind: 'FOUND', paymentId: claim.row.externalPaymentId,
          observation: await client.readLivePix({ ...request, paymentId: claim.row.externalPaymentId }),
        };
      }
    } catch (error: unknown) {
      result = {
        kind: error instanceof MercadoPagoError && error.code !== 'REQUEST_FAILED'
          ? 'INVALID_PROVIDER_PAYMENT' : 'PROVIDER_UNAVAILABLE',
      };
    }

    try {
      await this.finish(actor, claim, result);
    } catch (error: unknown) {
      if (error instanceof LeaseLost) return this.read(actor);
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      // Binding collision rolls back all writes. Preserve the review evidence.
      try {
        await this.finish(actor, claim, { kind: 'BINDING_CONFLICT' });
      } catch (retryError: unknown) {
        if (!(retryError instanceof LeaseLost)) throw retryError;
      }
    }

    return this.read(actor);
  }

  private async finish(actor: MercadoPagoLivePixActor, claim: RecoveryClaim, result: Result): Promise<void> {
    await organizationTransaction(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        const now = new Date();
        const attempt = await db.mercadoPagoLivePixRecovery.findFirst({
          where: {
            id: claim.id, issuanceId: claim.row.id, startedById: actor.userId,
            resultCode: 'IN_PROGRESS', leaseExpiresAt: { gt: now },
          },
        });
        if (attempt === null) throw new LeaseLost();

        let row = await this.find(db, actor);
        let authorized = false;
        try {
          await assertReceivingSettingsOwner(db, actor, true);
          authorized = await this.sessionCurrent(db, actor, now);
        } catch (error: unknown) {
          if (!(error instanceof ReceivingSettingsError)) throw error;
        }
        const connection = authorized && row !== null && row.issuedById === actor.userId
          ? await this.currentConnection(db, actor, row, now) : null;

        let code: string;
        let paymentId: string | null = null;
        if (
          !this.recoveryEnabled || row === null || connection === null ||
          connection.decision !== 'REUSE' ||
          connection.connectedAt.getTime() !== claim.connectedAt.getTime() ||
          connection.updatedAt.getTime() !== claim.updatedAt.getTime() ||
          row.id !== claim.row.id || row.issuedById !== claim.row.issuedById ||
          row.clientId !== claim.row.clientId || row.accountId !== claim.row.accountId ||
          row.receivableVersion !== claim.row.receivableVersion || row.amountInCents !== claim.row.amountInCents ||
          row.externalPaymentId !== claim.row.externalPaymentId ||
          row.providerChargeId !== claim.row.providerChargeId
        ) {
          code = 'CONNECTION_CHANGED';
        } else if (result.kind !== 'FOUND') {
          code = result.kind;
          if (code === 'AMBIGUOUS' || code === 'INVALID_PROVIDER_PAYMENT' || code === 'BINDING_CONFLICT') {
            await markLivePixReview(db, row, code);
          } else if (code === 'NOT_FOUND' && row.status === 'RESERVED') {
            await db.mercadoPagoLivePix.update({
              where: { id: row.id }, data: { status: 'REVIEW_REQUIRED', resultCode: 'UNCERTAIN_CREATION' },
            });
          }
        } else if (!/^[1-9]\d{0,29}$/.test(result.paymentId) ||
          (row.externalPaymentId !== null && row.externalPaymentId !== result.paymentId)) {
          code = 'INVALID_PROVIDER_PAYMENT';
          await markLivePixReview(db, row, code);
        } else {
          paymentId = result.paymentId;
          if (row.externalPaymentId === null) {
            const collision = await db.receivableProviderCharge.findUnique({
              where: { provider_externalAccountId_externalPaymentId: {
                provider: 'mercado-pago', externalAccountId: row.accountId, externalPaymentId: paymentId,
              } },
              select: { id: true },
            });
            if (collision !== null) {
              code = 'BINDING_CONFLICT';
              paymentId = null;
              await markLivePixReview(db, row, code);
            } else {
              await db.receivableProviderCharge.create({
                data: {
                  id: row.id, organizationId: row.organizationId, receivableId: row.receivableId,
                  provider: 'mercado-pago', externalAccountId: row.accountId, externalPaymentId: paymentId,
                  expectedAmountInCents: row.amountInCents, receivableVersion: row.receivableVersion,
                  registeredById: row.issuedById,
                },
              });
              row = await db.mercadoPagoLivePix.update({
                where: { id: row.id },
                data: {
                  status: 'REVIEW_REQUIRED', resultCode: row.resultCode ?? 'UNCERTAIN_CREATION',
                  externalPaymentId: paymentId, providerChargeId: row.id, recoveredAt: now,
                  copyAndPasteCiphertext: null, expiresAt: null,
                },
                include: { providerCharge: true },
              });
              code = await this.apply(db, row, paymentId, claim.id, result.observation);
            }
          } else {
            code = await this.apply(db, row, paymentId, claim.id, result.observation);
          }
        }

        // This audit record is the owner-initiated evidence, not a forged
        // signed delivery. A lease failure rolls back binding and settlement.
        const completedAt = new Date();
        const settled = await db.mercadoPagoLivePixRecovery.updateMany({
          where: { id: claim.id, resultCode: 'IN_PROGRESS', leaseExpiresAt: { gt: completedAt } },
          data: { resultCode: code, paymentId, completedAt },
        });
        if (settled.count !== 1) throw new LeaseLost();
      },
      this.errors(),
    );
  }

  private async apply(
    db: Prisma.TransactionClient,
    row: BoundIssuance,
    paymentId: string,
    claimId: string,
    observation: MercadoPagoLivePaymentObservation,
  ): Promise<string> {
    const binding = bindingFrom(row, { clientId: row.clientId, paymentId });
    if (!matchesBinding(row, binding)) {
      return (await markLivePixReview(db, row, 'INVALID_BINDING')).code;
    }
    return (await applyLivePixObservation(db, row, binding, 'recovery-' + claimId, observation)).code;
  }

  private find(db: Prisma.TransactionClient, actor: MercadoPagoLivePixActor) {
    return db.mercadoPagoLivePix.findUnique({
      where: { receivableId_organizationId: { receivableId: actor.receivableId, organizationId: actor.organizationId } },
      include: { providerCharge: true },
    });
  }

  private latest(db: Prisma.TransactionClient, issuanceId: string) {
    return db.mercadoPagoLivePixRecovery.findFirst({
      where: { issuanceId }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
  }

  private async sessionCurrent(db: Prisma.TransactionClient, actor: MercadoPagoLivePixActor, now: Date) {
    const sessions = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AuthSession"
      WHERE "id" = ${actor.sessionId}::uuid AND "userId" = ${actor.userId}::uuid
        AND "revokedAt" IS NULL AND "idleExpiresAt" > ${now} AND "absoluteExpiresAt" > ${now}
      FOR SHARE
    `;
    return sessions.length === 1;
  }

  private async currentConnection(
    db: Prisma.TransactionClient,
    actor: MercadoPagoLivePixActor,
    issuance: BoundIssuance | null,
    now: Date,
  ) {
    const clientId = this.runtime.clientId;
    if (!this.runtime.liveMode || this.runtime.client === null || !clientId ||
      (issuance !== null && issuance.clientId !== clientId)) return null;

    const row = await db.mercadoPagoConnection.findUnique({
      where: { organizationId_liveMode: { organizationId: actor.organizationId, liveMode: true } },
    });
    const attempt = await db.mercadoPagoOAuthAttempt.findUnique({
      where: { organizationId: actor.organizationId },
      select: { liveMode: true, expiresAt: true },
    });
    const decision = decideMercadoPagoCredentialAccess(
      row,
      { ownerId: actor.userId, clientId, liveMode: true },
      attempt !== null && attempt.liveMode && attempt.expiresAt > now,
      now,
    );
    return row !== null && (issuance === null || row.accountId === issuance.accountId) &&
      decision !== 'RECONNECT_REQUIRED' ? { ...row, decision } : null;
  }

  private errors() {
    return {
      notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
    };
  }
}

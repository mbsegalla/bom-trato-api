import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { MercadoPagoSandboxPixRepository } from '../../application/ports/mercadoPagoSandboxPixRepository.port.js';
import type {
  CreateMercadoPagoSandboxPixInput,
  MercadoPagoSandboxPixActor,
  MercadoPagoSandboxPixView,
} from '../../application/types/mercadoPagoSandboxPix.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import {
  assertSandboxPixInput,
  isValidSandboxDynamicPix,
  sandboxPixBalance,
  sandboxPixStatus,
  SANDBOX_PIX_EXPIRY_MS,
} from '../../domain/policies/mercadoPagoSandboxPix.policy.js';
import { decideMercadoPagoCredentialAccess } from '../../domain/policies/mercadoPagoRefresh.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import type { CreatedMercadoPagoPix } from '../providers/mercadoPago/mercadoPagoPix.types.js';

import { MercadoPagoCredentialService } from './mercadoPagoCredentialService.js';

function conflict(): never {
  throw new ReceivingSettingsError('MERCADO_PAGO_PIX_CONFLICT');
}

@Injectable()
export class PrismaMercadoPagoSandboxPixRepository extends MercadoPagoSandboxPixRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: MercadoPagoConnectionRuntime,
    private readonly credentials: MercadoPagoCredentialService,
  ) {
    super();
  }

  read(actor: MercadoPagoSandboxPixActor): Promise<MercadoPagoSandboxPixView> {
    return organizationTransaction<MercadoPagoSandboxPixView>(this.prisma, actor.organizationId, 'read', async (db) => {
      const access = await assertReceivingSettingsOwner(db, actor, false);
      const receivable = await this.receivable(db, actor);
      const row = await db.mercadoPagoSandboxPix.findUnique({
        where: { receivableId_organizationId: { receivableId: actor.receivableId, organizationId: actor.organizationId } },
      });
      const connection = await this.connection(db, actor);
      const now = new Date();
      const available = this.runtime.sandboxPixAvailable;
      const clientId = this.runtime.clientId;
      const decision = clientId
        ? decideMercadoPagoCredentialAccess(connection.row, { ownerId: actor.userId, clientId, liveMode: false }, connection.oauthInProgress, now)
        : 'RECONNECT_REQUIRED';
      const connectionCurrent =
        available && access.hasPlatformAccess && !access.billingNeedsReconciliation &&
        decision !== 'RECONNECT_REQUIRED' &&
        row !== null && connection.row?.accountId === row.accountId &&
        row.clientId === clientId && row.issuedById === actor.userId;
      let status = sandboxPixStatus(row, receivable, connectionCurrent, now);
      let copyAndPaste: string | null = null;
      if (status === 'PENDING' && row?.copyAndPasteCiphertext) {
        try {
          const code = this.runtime.cipher.open(this.qrContext(row), row.copyAndPasteCiphertext);
          if (isValidSandboxDynamicPix(code, row.amountInCents)) copyAndPaste = code;
          else status = 'REVIEW_REQUIRED';
        } catch {
          status = 'REVIEW_REQUIRED';
        }
      } else if (status === 'PENDING') {
        status = 'REVIEW_REQUIRED';
      }

      return {
        organizationId: actor.organizationId,
        receivableId: actor.receivableId,
        receivableVersion: receivable.version,
        available,
        canIssue: available && access.hasPlatformAccess && !access.billingNeedsReconciliation &&
          row === null && sandboxPixBalance(receivable) > 0 && decision !== 'RECONNECT_REQUIRED',
        status,
        issuanceId: row?.id ?? null,
        amountInCents: row?.amountInCents ?? null,
        paymentId: row?.issuedById === actor.userId ? row.externalPaymentId : null,
        expiresAt: row?.expiresAt ?? null,
        copyAndPaste,
        liveMode: false,
      };
    }, this.errors());
  }

  async issue(actor: MercadoPagoSandboxPixActor, input: CreateMercadoPagoSandboxPixInput): Promise<MercadoPagoSandboxPixView> {
    assertSandboxPixInput(input);
    if (!this.runtime.sandboxPixAvailable) throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    const { client, clientId } = this.runtime.requireEnabled();

    // A repeated request is a read, never a second provider operation.
    const existing = await this.read(actor);
    if (existing.issuanceId !== null) return existing;
    if (!existing.canIssue || existing.receivableVersion !== input.version) return conflict();

    const access = await this.credentials.accessForOwner(actor);
    if (access.liveMode) return conflict();

    const reservation = await organizationTransaction(this.prisma, actor.organizationId, 'write', async (db) => {
      await assertReceivingSettingsOwner(db, actor, true);
      const now = new Date();
      const sessions = await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AuthSession"
        WHERE "id" = ${actor.sessionId}::uuid AND "userId" = ${actor.userId}::uuid
          AND "revokedAt" IS NULL AND "idleExpiresAt" > ${now} AND "absoluteExpiresAt" > ${now}
        FOR SHARE
      `;
      if (sessions.length !== 1) return conflict();
      const receivable = await this.receivable(db, actor);
      const previous = await db.mercadoPagoSandboxPix.findUnique({
        where: { receivableId_organizationId: { receivableId: actor.receivableId, organizationId: actor.organizationId } },
      });
      if (previous !== null) return null;
      const amountInCents = sandboxPixBalance(receivable);
      if (receivable.version !== input.version || amountInCents <= 0) return conflict();

      const connection = await this.connection(db, actor);
      const row = connection.row;
      if (
        !this.runtime.sandboxPixAvailable || row === null ||
        row.accountId !== access.accountId ||
        row.accessTokenCiphertext === null ||
        decideMercadoPagoCredentialAccess(row, { ownerId: actor.userId, clientId, liveMode: false }, connection.oauthInProgress, now) !== 'REUSE'
      ) return conflict();

      const currentToken = this.runtime.cipher.open(
        ['credential', actor.organizationId, clientId, 'false', row.accountId, 'access'],
        row.accessTokenCiphertext,
      );
      if (currentToken !== access.accessToken) return conflict();

      return db.mercadoPagoSandboxPix.create({
        data: {
          id: randomUUID(),
          organizationId: actor.organizationId,
          receivableId: actor.receivableId,
          receivableVersion: receivable.version,
          accountId: row.accountId,
          clientId,
          issuedById: actor.userId,
          amountInCents,
          requestedExpiresAt: new Date(now.getTime() + SANDBOX_PIX_EXPIRY_MS),
          createdAt: now,
        },
      });
    }, this.errors());

    if (reservation === null) return this.read(actor);

    // Never retry an uncertain create or replace its UUID. No provider call in a retryable transaction.
    let result: CreatedMercadoPagoPix | null = null;
    try {
      result = await client.createSandboxPix({
        issuanceId: reservation.id,
        accountId: reservation.accountId,
        accessToken: access.accessToken,
        amountInCents: reservation.amountInCents,
        expiresAt: reservation.requestedExpiresAt,
        payer: {
          email: input.testBuyerEmail,
          identification: { type: input.testDocumentType, number: input.testDocumentNumber },
        },
      });
    } catch {
      // The remote result may exist. Keep the reserved identity and mark it for review.
    }

    const identity = result !== null && result.liveMode === false &&
      result.accountId === reservation.accountId &&
      result.issuanceId === reservation.id &&
      result.amountInCents === reservation.amountInCents && result.currency === 'brl'
      ? result : null;
    const pending = identity?.kind === 'PENDING' &&
      identity.expiresAt.getTime() > Date.now() &&
      identity.expiresAt.getTime() <= reservation.requestedExpiresAt.getTime() + 1000 &&
      isValidSandboxDynamicPix(identity.copyAndPaste, reservation.amountInCents)
      ? identity : null;

    // Save the observed provider outcome even if ownership, session or balance changed during I/O.
    // Read authorization and freshness are checked again before revealing a QR.
    await organizationTransaction(this.prisma, actor.organizationId, 'write', async (db) => {
      await db.mercadoPagoSandboxPix.updateMany({
        where: { id: reservation.id, organizationId: actor.organizationId, status: 'RESERVED' },
        data: {
          status: pending ? 'PENDING' : 'REVIEW_REQUIRED',
          externalPaymentId: identity?.paymentId ?? null,
          copyAndPasteCiphertext: pending
            ? this.runtime.cipher.seal(this.qrContext(reservation), pending.copyAndPaste) : null,
          expiresAt: pending?.expiresAt ?? null,
        },
      });
    }, this.errors());

    return this.read(actor);
  }

  private async receivable(db: Prisma.TransactionClient, actor: MercadoPagoSandboxPixActor) {
    const row = await db.receivable.findFirst({
      where: { id: actor.receivableId, organizationId: actor.organizationId },
      select: { version: true, status: true, currency: true, amountInCents: true, receivedInCents: true },
    });
    if (row === null) throw new ReceivingSettingsError('RECEIVABLE_NOT_FOUND');
    return row;
  }

  private async connection(db: Prisma.TransactionClient, actor: MercadoPagoSandboxPixActor) {
    const row = await db.mercadoPagoConnection.findUnique({
      where: { organizationId_liveMode: { organizationId: actor.organizationId, liveMode: false } },
    });
    const attempt = await db.mercadoPagoOAuthAttempt.findUnique({
      where: { organizationId: actor.organizationId },
      select: { liveMode: true, expiresAt: true },
    });
    return { row, oauthInProgress: attempt !== null && !attempt.liveMode && attempt.expiresAt > new Date() };
  }

  private qrContext(row: { id: string; organizationId: string; clientId: string; accountId: string }): string[] {
    return ['sandbox-pix', row.organizationId, row.clientId, row.accountId, row.id];
  }

  private errors() {
    return {
      notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
    };
  }
}

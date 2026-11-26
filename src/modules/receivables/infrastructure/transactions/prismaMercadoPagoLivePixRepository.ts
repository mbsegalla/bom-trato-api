import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { MercadoPagoLivePixRepository } from '../../application/ports/mercadoPagoLivePixRepository.port.js';
import type {
  IssueMercadoPagoLivePixInput,
  MercadoPagoLivePixActor,
  MercadoPagoLivePixIssuance,
} from '../../application/types/mercadoPagoLivePix.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { assertLivePixInput } from '../../domain/policies/mercadoPagoLivePix.policy.js';
import { decideMercadoPagoCredentialAccess } from '../../domain/policies/mercadoPagoRefresh.policy.js';
import {
  isValidSandboxDynamicPix,
  SANDBOX_PIX_EXPIRY_MS,
  sandboxPixBalance,
} from '../../domain/policies/mercadoPagoSandboxPix.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import type { CreatedMercadoPagoPix } from '../providers/mercadoPago/mercadoPagoPix.types.js';

import { MercadoPagoCredentialService } from './mercadoPagoCredentialService.js';

function conflict(): never {
  throw new ReceivingSettingsError('MERCADO_PAGO_PIX_CONFLICT');
}

type Reservation = {
  id: string;
  organizationId: string;
  receivableId: string;
  receivableVersion: number;
  issuedById: string;
  clientId: string;
  accountId: string;
  amountInCents: number;
  requestedExpiresAt: Date;
};

@Injectable()
export class PrismaMercadoPagoLivePixRepository extends MercadoPagoLivePixRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: MercadoPagoConnectionRuntime,
    private readonly credentials: MercadoPagoCredentialService,
  ) {
    super();
  }

  async issue(
    actor: MercadoPagoLivePixActor,
    input: IssueMercadoPagoLivePixInput,
  ): Promise<MercadoPagoLivePixIssuance> {
    assertLivePixInput(input);
    if (!this.runtime.livePixAllowed(actor.organizationId)) {
      throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    }

    const { client, clientId } = this.runtime.requireEnabled();

    // A repeated request never retries an uncertain provider create.
    const existing = await this.read(actor);
    if (existing !== null) {
      return existing;
    }

    const access = await this.credentials.accessForOwner(actor);
    if (!access.liveMode || !this.runtime.livePixAllowed(actor.organizationId, access.accountId)) {
      return conflict();
    }

    const reservation = await organizationTransaction(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, true);
        const now = new Date();
        if (!(await this.sessionCurrent(db, actor, now))) {
          return conflict();
        }
        const previous = await this.find(db, actor);
        if (previous !== null) {
          if (previous.issuedById !== actor.userId) {
            return conflict();
          }
          return null;
        }

        const receivable = await this.receivable(db, actor);
        // The remaining-balance and BR Code invariants are identical in both modes.
        const amountInCents = sandboxPixBalance(receivable);
        if (
          receivable.version !== input.version ||
          !this.runtime.livePixAllowed(actor.organizationId, access.accountId, amountInCents)
        ) {
          return conflict();
        }

        // Only one unresolved live reservation per pilot organization. Review
        // evidence is not an authorization to collect from another customer.
        const unresolved = await db.mercadoPagoLivePix.findFirst({
          where: { organizationId: actor.organizationId, status: { in: ['RESERVED', 'PENDING', 'REVIEW_REQUIRED'] } },
          select: { id: true },
        });
        if (unresolved !== null) {
          return conflict();
        }

        // A legacy/other provider charge is not evidence that it is safe to
        // issue another payment for the same receivable.
        const priorCharge = await db.receivableProviderCharge.findFirst({
          where: { organizationId: actor.organizationId, receivableId: actor.receivableId },
          select: { id: true },
        });
        if (priorCharge !== null) {
          return conflict();
        }

        const connection = await this.currentConnection(db, actor, clientId, access.accountId, now);
        if (connection === null || connection.accessTokenCiphertext === null) {
          return conflict();
        }

        const currentToken = this.runtime.cipher.open(
          ['credential', actor.organizationId, clientId, 'true', access.accountId, 'access'],
          connection.accessTokenCiphertext,
        );
        if (currentToken !== access.accessToken) {
          return conflict();
        }

        const row = await db.mercadoPagoLivePix.create({
          data: {
            id: randomUUID(),
            organizationId: actor.organizationId,
            receivableId: actor.receivableId,
            receivableVersion: receivable.version,
            issuedById: actor.userId,
            clientId,
            accountId: access.accountId,
            amountInCents,
            requestedExpiresAt: new Date(now.getTime() + SANDBOX_PIX_EXPIRY_MS),
            createdAt: now,
          },
        });

        return { row, connectedAt: connection.connectedAt };
      },
      this.errors(),
    );

    if (reservation === null) {
      const previous = await this.read(actor);
      return previous ?? conflict();
    }

    // Outside a retryable DB transaction, after the immutable reservation is committed.
    let result: CreatedMercadoPagoPix | null = null;
    try {
      result = await client.createLivePix({
        issuanceId: reservation.row.id,
        accountId: reservation.row.accountId,
        accessToken: access.accessToken,
        amountInCents: reservation.row.amountInCents,
        expiresAt: reservation.row.requestedExpiresAt,
        payer: {
          email: input.buyerEmail,
          identification: { type: input.buyerDocumentType, number: input.buyerDocumentNumber },
        },
      });
    } catch {
      // The provider may already have accepted the payment. Do not retry or
      // record raw provider errors, payer data or tokens.
    }

    try {
      await this.finalize(actor, reservation.row, reservation.connectedAt, result);
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      // Any competing provider identity/charge binding rolled back the full
      // transaction. Retain the reservation without adopting that payment.
      await organizationTransaction(
        this.prisma,
        actor.organizationId,
        'write',
        (db) =>
          db.mercadoPagoLivePix.updateMany({
            where: { id: reservation.row.id, organizationId: actor.organizationId, status: 'RESERVED' },
            data: { status: 'REVIEW_REQUIRED', resultCode: 'BINDING_CONFLICT' },
          }),
        this.errors(),
      );
    }

    const outcome = await this.read(actor);
    return outcome ?? conflict();
  }

  private async finalize(
    actor: MercadoPagoLivePixActor,
    reservation: Reservation,
    connectedAt: Date,
    result: CreatedMercadoPagoPix | null,
  ): Promise<void> {
    await organizationTransaction(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        const current = await this.find(db, actor);
        if (
          current === null ||
          current.id !== reservation.id ||
          current.status !== 'RESERVED' ||
          current.issuedById !== reservation.issuedById ||
          current.clientId !== reservation.clientId ||
          current.accountId !== reservation.accountId ||
          current.amountInCents !== reservation.amountInCents ||
          current.receivableVersion !== reservation.receivableVersion
        ) {
          return;
        }

        const identity =
          result !== null &&
          result.liveMode === true &&
          /^[1-9]\d{0,29}$/.test(result.paymentId) &&
          result.accountId === reservation.accountId &&
          result.issuanceId === reservation.id &&
          result.amountInCents === reservation.amountInCents &&
          result.currency === 'brl'
            ? result
            : null;

        if (identity === null) {
          await db.mercadoPagoLivePix.update({
            where: { id: reservation.id },
            data: { status: 'REVIEW_REQUIRED', resultCode: 'UNCERTAIN_CREATION' },
          });
          return;
        }

        // Bind the original snapshot, even if the receivable/owner changed
        // during I/O. Any later settlement must review that stale snapshot.
        // The generic confirmation repository remains the sole ledger writer.
        const charge = await db.receivableProviderCharge.create({
          data: {
            id: reservation.id,
            organizationId: reservation.organizationId,
            receivableId: reservation.receivableId,
            provider: 'mercado-pago',
            externalAccountId: reservation.accountId,
            externalPaymentId: identity.paymentId,
            expectedAmountInCents: reservation.amountInCents,
            receivableVersion: reservation.receivableVersion,
            registeredById: reservation.issuedById,
          },
        });

        const now = new Date();
        let authorized = false;
        try {
          await assertReceivingSettingsOwner(db, actor, true);
          authorized = await this.sessionCurrent(db, actor, now);
        } catch (error: unknown) {
          if (!(error instanceof ReceivingSettingsError)) {
            throw error;
          }
        }

        const connection = authorized
          ? await this.currentConnection(db, actor, reservation.clientId, reservation.accountId, now)
          : null;
        const receivable = await this.receivable(db, actor);
        const fresh =
          connection !== null &&
          connection.connectedAt.getTime() === connectedAt.getTime() &&
          receivable.version === reservation.receivableVersion &&
          sandboxPixBalance(receivable) === reservation.amountInCents;
        const pending =
          identity.kind === 'PENDING' &&
          fresh &&
          identity.expiresAt.getTime() > now.getTime() &&
          identity.expiresAt.getTime() <= reservation.requestedExpiresAt.getTime() + 1000 &&
          isValidSandboxDynamicPix(identity.copyAndPaste, reservation.amountInCents)
            ? identity
            : null;

        await db.mercadoPagoLivePix.update({
          where: { id: reservation.id },
          data: {
            externalPaymentId: identity.paymentId,
            providerChargeId: charge.id,
            status: pending !== null ? 'PENDING' : 'REVIEW_REQUIRED',
            resultCode: pending !== null ? 'VERIFIED_PENDING' : fresh ? 'VERIFIED_REVIEW_REQUIRED' : 'SNAPSHOT_CHANGED',
            copyAndPasteCiphertext:
              pending !== null
                ? this.runtime.cipher.seal(
                    [
                      'live-pix',
                      reservation.organizationId,
                      reservation.clientId,
                      reservation.accountId,
                      reservation.id,
                    ],
                    pending.copyAndPaste,
                  )
                : null,
            expiresAt: pending?.expiresAt ?? null,
          },
        });
        // No ledger payment is created here, even for a provider approval.
      },
      this.errors(),
    );
  }

  private read(actor: MercadoPagoLivePixActor): Promise<MercadoPagoLivePixIssuance | null> {
    return organizationTransaction(
      this.prisma,
      actor.organizationId,
      'read',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, false);
        const row = await this.find(db, actor);
        if (row === null) {
          return null;
        }
        if (row.issuedById !== actor.userId) {
          return conflict();
        }
        return { issuanceId: row.id, providerChargeId: row.providerChargeId, status: row.status };
      },
      this.errors(),
    );
  }

  private find(db: Prisma.TransactionClient, actor: MercadoPagoLivePixActor) {
    return db.mercadoPagoLivePix.findUnique({
      where: {
        receivableId_organizationId: { receivableId: actor.receivableId, organizationId: actor.organizationId },
      },
    });
  }

  private async receivable(db: Prisma.TransactionClient, actor: MercadoPagoLivePixActor) {
    const row = await db.receivable.findFirst({
      where: { id: actor.receivableId, organizationId: actor.organizationId },
      select: { version: true, status: true, currency: true, amountInCents: true, receivedInCents: true },
    });
    if (row === null) {
      throw new ReceivingSettingsError('RECEIVABLE_NOT_FOUND');
    }
    return row;
  }

  private async sessionCurrent(db: Prisma.TransactionClient, actor: MercadoPagoLivePixActor, now: Date) {
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
    actor: MercadoPagoLivePixActor,
    clientId: string,
    accountId: string,
    now: Date,
  ) {
    if (!this.runtime.livePixAllowed(actor.organizationId, accountId) || this.runtime.clientId !== clientId) {
      return null;
    }
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
    return row !== null && row.accountId === accountId && decision === 'REUSE' ? row : null;
  }

  private errors() {
    return {
      notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
    };
  }
}

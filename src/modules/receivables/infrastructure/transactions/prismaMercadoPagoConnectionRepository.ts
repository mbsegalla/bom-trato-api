import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { MercadoPagoConnectionRepository } from '../../application/ports/mercadoPagoConnectionRepository.port.js';
import type {
  MercadoPagoCompletionInput,
  MercadoPagoCompletionView,
  MercadoPagoConnectionActor,
  MercadoPagoConnectionStatus,
  MercadoPagoConnectionView,
  MercadoPagoStartView,
} from '../../application/types/mercadoPagoConnection.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import {
  hashMercadoPagoState,
  isMercadoPagoAttemptCurrent,
  MERCADO_PAGO_STATE_TTL_MS,
} from '../../domain/policies/mercadoPagoOAuth.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

function invalid(): never {
  throw new ReceivingSettingsError('MERCADO_PAGO_OAUTH_INVALID');
}

@Injectable()
export class PrismaMercadoPagoConnectionRepository extends MercadoPagoConnectionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: MercadoPagoConnectionRuntime,
  ) {
    super();
  }

  read(actor: MercadoPagoConnectionActor): Promise<MercadoPagoConnectionView> {
    return organizationTransaction(
      this.prisma,
      actor.organizationId,
      'read',
      async (db) => {
        const access = await assertReceivingSettingsOwner(db, actor, false);
        const row = await db.mercadoPagoConnection.findUnique({
          where: { organizationId_liveMode: { organizationId: actor.organizationId, liveMode: this.runtime.liveMode } },
          select: {
            accountId: true,
            clientId: true,
            connectedById: true,
            connectedAt: true,
            disconnectedAt: true,
            expiresAt: true,
          },
        });
        const pending = await db.mercadoPagoOAuthAttempt.findUnique({
          where: { organizationId: actor.organizationId },
          select: { liveMode: true },
        });
        let status: MercadoPagoConnectionStatus = 'NOT_CONNECTED';

        if (row !== null) {
          status = row.disconnectedAt !== null
            ? 'DISCONNECTED'
            : row.connectedById !== actor.userId || row.clientId !== this.runtime.clientId
              ? 'RECONNECT_REQUIRED'
              : row.expiresAt !== null && row.expiresAt > new Date()
                ? 'CONNECTED'
                : 'EXPIRED';
        }

        return {
          available: this.runtime.client !== null,
          liveMode: this.runtime.liveMode,
          canConnect: this.runtime.client !== null && access.hasPlatformAccess && !access.billingNeedsReconciliation,
          canDisconnect: (row !== null && row.disconnectedAt === null) || pending?.liveMode === this.runtime.liveMode,
          status,
          accountId: row?.connectedById === actor.userId ? row.accountId : null,
          connectedAt: row?.connectedAt ?? null,
          expiresAt: row?.expiresAt ?? null,
        };
      },
      this.errors(),
    );
  }

  start(actor: MercadoPagoConnectionActor): Promise<MercadoPagoStartView> {
    const { client, clientId } = this.runtime.requireEnabled();

    return organizationTransaction(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, true);
        await this.assertSession(db, actor);

        const request = client.createAuthorizationRequest();
        const stateHash = hashMercadoPagoState(request.state);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + MERCADO_PAGO_STATE_TTL_MS);
        const liveMode = this.runtime.liveMode;
        const data = {
          ownerId: actor.userId,
          sessionId: actor.sessionId,
          clientId,
          liveMode,
          stateHash,
          verifierCiphertext: this.runtime.cipher.seal(['verifier', actor.organizationId, clientId, String(liveMode), stateHash], request.verifier),
          createdAt,
          expiresAt,
          consumedAt: null,
        };

        await db.mercadoPagoOAuthAttempt.upsert({
          where: { organizationId: actor.organizationId },
          create: { ...data, organizationId: actor.organizationId },
          update: data,
        });

        return { authorizationUrl: request.url, expiresAt };
      },
      this.errors(),
    );
  }

  async complete(
    identity: Omit<MercadoPagoConnectionActor, 'organizationId'>,
    input: MercadoPagoCompletionInput,
  ): Promise<MercadoPagoCompletionView> {
    const { client, clientId } = this.runtime.requireEnabled();
    const stateHash = hashMercadoPagoState(input.state);
    const found = await this.prisma.mercadoPagoOAuthAttempt.findUnique({
      where: { stateHash },
      select: { organizationId: true, ownerId: true, sessionId: true },
    });

    if (found === null || found.ownerId !== identity.userId || found.sessionId !== identity.sessionId) {
      return invalid();
    }

    const actor = { ...identity, organizationId: found.organizationId };
    const context = {
      organizationId: actor.organizationId,
      ownerId: actor.userId,
      sessionId: actor.sessionId,
      clientId,
      liveMode: this.runtime.liveMode,
    };
    const verifierContext = ['verifier', actor.organizationId, clientId, String(context.liveMode), stateHash];
    const verifier = await organizationTransaction(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, true);
        await this.assertSession(db, actor);
        const row = await db.mercadoPagoOAuthAttempt.findUnique({ where: { stateHash } });

        if (
          row === null ||
          !isMercadoPagoAttemptCurrent(row, context, new Date(), false) ||
          row.verifierCiphertext === null
        ) {
          return invalid();
        }

        const value = this.runtime.cipher.open(verifierContext, row.verifierCiphertext);

        await db.mercadoPagoOAuthAttempt.update({
          where: { stateHash },
          data: { consumedAt: new Date(), verifierCiphertext: null },
        });

        return value;
      },
      this.errors(),
    );

    // A provider request must not run within a retryable database transaction.
    // Once consumed, an attempt cannot exchange a second code, including after a network failure.
    const credentials = await client.exchangeCode(input.code, verifier).catch(() => {
      throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    });

    try {
      return await organizationTransaction(
        this.prisma,
        actor.organizationId,
        'write',
        async (db) => {
          await assertReceivingSettingsOwner(db, actor, true);
          await this.assertSession(db, actor);
          const row = await db.mercadoPagoOAuthAttempt.findUnique({ where: { stateHash } });
          const now = new Date();

          if (
            row === null ||
            !isMercadoPagoAttemptCurrent(row, context, now, true) ||
            credentials.liveMode !== context.liveMode ||
            credentials.expiresAt <= now
          ) {
            return invalid();
          }

          const current = await db.mercadoPagoConnection.findUnique({
            where: { organizationId_liveMode: { organizationId: actor.organizationId, liveMode: context.liveMode } },
            select: { accountId: true },
          });
          const bound = await db.mercadoPagoConnection.findUnique({
            where: { accountId_liveMode: { accountId: credentials.accountId, liveMode: context.liveMode } },
            select: { organizationId: true },
          });

          if (
            (current !== null && current.accountId !== credentials.accountId) ||
            (bound !== null && bound.organizationId !== actor.organizationId)
          ) {
            throw new ReceivingSettingsError('MERCADO_PAGO_ACCOUNT_CONFLICT');
          }

          const credentialContext = ['credential', actor.organizationId, clientId, String(context.liveMode), credentials.accountId];
          const data = {
            clientId,
            accountId: credentials.accountId,
            connectedById: actor.userId,
            accessTokenCiphertext: this.runtime.cipher.seal([...credentialContext, 'access'], credentials.accessToken),
            refreshTokenCiphertext: this.runtime.cipher.seal([...credentialContext, 'refresh'], credentials.refreshToken),
            expiresAt: credentials.expiresAt,
            connectedAt: now,
            disconnectedAt: null,
          };

          await db.mercadoPagoConnection.upsert({
            where: { organizationId_liveMode: { organizationId: actor.organizationId, liveMode: context.liveMode } },
            create: { ...data, organizationId: actor.organizationId, liveMode: context.liveMode },
            update: data,
          });
          await db.mercadoPagoOAuthAttempt.delete({ where: { stateHash } });
          const organization = await db.organization.findUniqueOrThrow({
            where: { id: actor.organizationId },
            select: { name: true },
          });

          return {
            organizationId: actor.organizationId,
            organizationName: organization.name,
            accountId: credentials.accountId,
            liveMode: context.liveMode,
          };
        },
        this.errors(),
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ReceivingSettingsError('MERCADO_PAGO_ACCOUNT_CONFLICT');
      }

      throw error;
    }
  }

  disconnect(actor: MercadoPagoConnectionActor): Promise<void> {
    return organizationTransaction(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, false);
        await this.assertSession(db, actor);
        await db.mercadoPagoOAuthAttempt.deleteMany({
          where: { organizationId: actor.organizationId, liveMode: this.runtime.liveMode },
        });
        await db.mercadoPagoConnection.updateMany({
          where: { organizationId: actor.organizationId, liveMode: this.runtime.liveMode, disconnectedAt: null },
          data: {
            disconnectedAt: new Date(),
            accessTokenCiphertext: null,
            refreshTokenCiphertext: null,
            expiresAt: null,
          },
        });
      },
      this.errors(),
    );
  }

  private async assertSession(db: Prisma.TransactionClient, actor: MercadoPagoConnectionActor): Promise<void> {
    const now = new Date();
    const sessions = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AuthSession"
      WHERE "id" = ${actor.sessionId}::uuid
        AND "userId" = ${actor.userId}::uuid
        AND "revokedAt" IS NULL
        AND "idleExpiresAt" > ${now}
        AND "absoluteExpiresAt" > ${now}
      FOR SHARE
    `;

    if (sessions.length === 0) {
      return invalid();
    }
  }

  private errors() {
    return {
      notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
    };
  }
}

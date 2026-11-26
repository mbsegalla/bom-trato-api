import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type { MercadoPagoConnectionActor } from '../../application/types/mercadoPagoConnection.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { decideMercadoPagoCredentialAccess, MERCADO_PAGO_REFRESH_MARGIN_MS } from '../../domain/policies/mercadoPagoRefresh.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

export interface MercadoPagoSellerAccess {
  accountId: string;
  accessToken: string;
  liveMode: boolean;
  expiresAt: Date;
}

type CredentialClaim =
  | { kind: 'REUSE'; access: MercadoPagoSellerAccess }
  | { kind: 'ROTATE'; claimId: string; accountId: string; refreshToken: string };

function unavailable(): never {
  throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
}

@Injectable()
export class MercadoPagoCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: MercadoPagoConnectionRuntime,
  ) {}

  // Internal only. Do not return this result in any HTTP response or log.
  // Future issuance must revalidate owner, account and receivable under its own reservation lock.
  async accessForOwner(actor: MercadoPagoConnectionActor): Promise<MercadoPagoSellerAccess> {
    const { client, clientId } = this.runtime.requireEnabled();
    const liveMode = this.runtime.liveMode;
    const key = { organizationId: actor.organizationId, liveMode };
    const where = { organizationId_liveMode: key };
    const aad = (accountId: string, purpose: 'access' | 'refresh') => [
      'credential',
      actor.organizationId,
      clientId,
      String(liveMode),
      accountId,
      purpose,
    ];

    const claimed = await organizationTransaction<CredentialClaim>(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, true);
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
          return unavailable();
        }

        const row = await db.mercadoPagoConnection.findUnique({ where });
        const attempt = await db.mercadoPagoOAuthAttempt.findUnique({
          where: { organizationId: actor.organizationId },
          select: { liveMode: true, expiresAt: true },
        });
        const oauthInProgress = attempt !== null && attempt.liveMode === liveMode && attempt.expiresAt > now;
        const decision = decideMercadoPagoCredentialAccess(row, { ownerId: actor.userId, clientId, liveMode }, oauthInProgress, now);

        if (
          row === null ||
          row.expiresAt === null ||
          row.accessTokenCiphertext === null ||
          row.refreshTokenCiphertext === null ||
          decision === 'RECONNECT_REQUIRED'
        ) {
          return unavailable();
        }

        if (decision === 'REUSE') {
          return {
            kind: 'REUSE',
            access: {
              accountId: row.accountId,
              accessToken: this.runtime.cipher.open(aad(row.accountId, 'access'), row.accessTokenCiphertext),
              liveMode,
              expiresAt: row.expiresAt,
            },
          };
        }

        const claimId = randomUUID();
        const refreshToken = this.runtime.cipher.open(aad(row.accountId, 'refresh'), row.refreshTokenCiphertext);

        await db.mercadoPagoConnection.update({
          where,
          data: { refreshClaimId: claimId, refreshStartedAt: now },
        });

        return { kind: 'ROTATE', claimId, accountId: row.accountId, refreshToken };
      },
      this.errors(),
    );

    if (claimed.kind === 'REUSE') {
      return claimed.access;
    }

    // A single persistent claim is committed before contacting the provider.
    // On timeout, crash or invalid response, the old refresh token may already be spent.
    // Retain the claim and require new OAuth; never automatically retry that grant.
    const credentials = await client.refreshCredentials(claimed.accountId, claimed.refreshToken).catch(() => unavailable());

    if (
      credentials.accountId !== claimed.accountId ||
      credentials.liveMode !== liveMode ||
      credentials.expiresAt.getTime() <= Date.now() + MERCADO_PAGO_REFRESH_MARGIN_MS
    ) {
      return unavailable();
    }

    return organizationTransaction(
      this.prisma,
      actor.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, actor, true);
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
          return unavailable();
        }

        const attempt = await db.mercadoPagoOAuthAttempt.findUnique({
          where: { organizationId: actor.organizationId },
          select: { liveMode: true, expiresAt: true },
        });

        if (attempt !== null && attempt.liveMode === liveMode && attempt.expiresAt > now) {
          return unavailable();
        }

        const result = await db.mercadoPagoConnection.updateMany({
          where: {
            ...key,
            clientId,
            accountId: claimed.accountId,
            connectedById: actor.userId,
            disconnectedAt: null,
            refreshClaimId: claimed.claimId,
          },
          data: {
            accessTokenCiphertext: this.runtime.cipher.seal(aad(claimed.accountId, 'access'), credentials.accessToken),
            refreshTokenCiphertext: this.runtime.cipher.seal(aad(claimed.accountId, 'refresh'), credentials.refreshToken),
            expiresAt: credentials.expiresAt,
            refreshClaimId: null,
            refreshStartedAt: null,
          },
        });

        if (result.count !== 1) {
          return unavailable();
        }

        // The provider has already rotated its token. Persist both new tokens
        // atomically; authorization for any subsequent payment is a separate check.
        return {
          accountId: credentials.accountId,
          accessToken: credentials.accessToken,
          liveMode,
          expiresAt: credentials.expiresAt,
        };
      },
      this.errors(),
    );
  }

  private errors() {
    return {
      notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
    };
  }
}

import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readTransaction } from '../../../../infrastructure/database/prismaTransaction.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { ReceivablePaymentLinkRepository } from '../../application/ports/receivablePaymentLinkRepository.port.js';
import type { FindReceivableParams } from '../../application/types/receivable.types.js';
import type {
  CreatedReceivablePaymentLink,
  PublicReceivablePaymentLink,
  ReceivablePaymentLinkStatus,
} from '../../application/types/receivablePaymentLink.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import {
  isReceivablePaymentLinkCurrent,
  RECEIVABLE_PAYMENT_LINK_DURATION_MS,
} from '../../domain/policies/receivablePaymentLink.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { ReceivingSettingsCipher } from '../security/receivingSettingsCipher.js';

import { readReceivablePixCharge } from './readReceivablePixCharge.js';

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function unavailable(): never {
  throw new ReceivingSettingsError('PAYMENT_LINK_UNAVAILABLE');
}

@Injectable()
export class PrismaReceivablePaymentLinkRepository extends ReceivablePaymentLinkRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: ReceivingSettingsCipher,
  ) {
    super();
  }

  create(params: FindReceivableParams, version: number): Promise<CreatedReceivablePaymentLink> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, params, true);

        const charge = await readReceivablePixCharge(db, this.cipher, params.organizationId, params.receivableId);

        if (charge.receivableVersion !== version) {
          throw new ReceivingSettingsError('PAYMENT_LINK_VERSION_CONFLICT');
        }

        const token = randomBytes(32).toString('hex');
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + RECEIVABLE_PAYMENT_LINK_DURATION_MS);
        const data = {
          tokenHash: tokenHash(token),
          receivableVersion: version,
          receivingSettingsVersion: charge.receivingSettingsVersion,
          createdById: params.userId,
          createdAt,
          expiresAt,
          revokedAt: null,
        };

        await db.receivablePaymentLink.upsert({
          where: {
            receivableId_organizationId: { receivableId: params.receivableId, organizationId: params.organizationId },
          },
          create: { ...data, receivableId: params.receivableId, organizationId: params.organizationId },
          update: data,
        });

        return { token, expiresAt };
      },
      this.errors(),
    );
  }

  status(params: FindReceivableParams): Promise<ReceivablePaymentLinkStatus | null> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const access = await assertReceivingSettingsOwner(db, params, false);
        const link = await db.receivablePaymentLink.findUnique({
          where: {
            receivableId_organizationId: { receivableId: params.receivableId, organizationId: params.organizationId },
          },
          include: {
            receivable: { select: { version: true, status: true, amountInCents: true, receivedInCents: true } },
          },
        });

        if (link === null) {
          return null;
        }

        const settings = await db.organizationReceivingSettings.findUnique({
          where: { organizationId: params.organizationId },
          select: { version: true, pixEnabled: true },
        });
        const { receivable } = link;
        const active =
          access.hasPlatformAccess &&
          !access.billingNeedsReconciliation &&
          this.cipher.available &&
          settings?.pixEnabled === true &&
          (receivable.status === 'OPEN' || receivable.status === 'PARTIALLY_PAID') &&
          receivable.amountInCents > receivable.receivedInCents &&
          isReceivablePaymentLinkCurrent(
            link,
            {
              ownerId: params.userId,
              receivableVersion: receivable.version,
              receivingSettingsVersion: settings.version,
            },
            new Date(),
          );

        return { active, expiresAt: link.expiresAt };
      },
      this.errors(),
    );
  }

  revoke(params: FindReceivableParams): Promise<void> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, params, false);
        await db.receivablePaymentLink.updateMany({
          where: { organizationId: params.organizationId, receivableId: params.receivableId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      this.errors(),
    );
  }

  resolve(token: string): Promise<PublicReceivablePaymentLink> {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return Promise.reject(new ReceivingSettingsError('PAYMENT_LINK_UNAVAILABLE'));
    }

    return readTransaction(this.prisma, async (db) => {
      const link = await db.receivablePaymentLink.findUnique({ where: { tokenHash: tokenHash(token) } });

      if (link === null || link.revokedAt !== null || link.expiresAt <= new Date()) {
        return unavailable();
      }

      const organization = await db.organization.findUnique({
        where: { id: link.organizationId },
        select: { name: true, ownerId: true },
      });

      if (organization === null || organization.ownerId !== link.createdById) {
        return unavailable();
      }

      try {
        await assertReceivingSettingsOwner(
          db,
          { organizationId: link.organizationId, userId: organization.ownerId },
          true,
        );

        const charge = await readReceivablePixCharge(db, this.cipher, link.organizationId, link.receivableId);

        if (
          !isReceivablePaymentLinkCurrent(
            link,
            {
              ownerId: organization.ownerId,
              receivableVersion: charge.receivableVersion,
              receivingSettingsVersion: charge.receivingSettingsVersion,
            },
            new Date(),
          )
        ) {
          return unavailable();
        }

        return {
          organizationName: organization.name,
          merchantName: charge.merchantName,
          amountInCents: charge.amountInCents,
          currency: charge.currency,
          copyAndPaste: charge.copyAndPaste,
          expiresAt: link.expiresAt,
        };
      } catch (error: unknown) {
        if (error instanceof ReceivingSettingsError) {
          return unavailable();
        }

        throw error;
      }
    });
  }

  private errors() {
    return {
      notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
      busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
    };
  }
}

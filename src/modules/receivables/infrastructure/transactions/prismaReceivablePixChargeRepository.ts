import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { ReceivablePixChargeRepository } from '../../application/ports/receivablePixChargeRepository.port.js';
import type { FindReceivableParams } from '../../application/types/receivable.types.js';
import type { ReceivablePixCharge } from '../../application/types/receivablePixCharge.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { createReceivablePixCharge } from '../../domain/policies/receivablePixCharge.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { ReceivingSettingsCipher } from '../security/receivingSettingsCipher.js';

@Injectable()
export class PrismaReceivablePixChargeRepository extends ReceivablePixChargeRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: ReceivingSettingsCipher,
  ) {
    super();
  }

  read(params: FindReceivableParams): Promise<ReceivablePixCharge> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        await assertReceivingSettingsOwner(db, params, true);

        const receivable = await db.receivable.findFirst({
          where: { id: params.receivableId, organizationId: params.organizationId },
          select: {
            id: true,
            currency: true,
            status: true,
            amountInCents: true,
            receivedInCents: true,
            version: true,
          },
        });

        if (receivable === null) {
          throw new ReceivingSettingsError('RECEIVABLE_NOT_FOUND');
        }

        if (
          (receivable.status !== 'OPEN' && receivable.status !== 'PARTIALLY_PAID') ||
          receivable.amountInCents <= receivable.receivedInCents
        ) {
          throw new ReceivingSettingsError('PIX_CHARGE_NOT_AVAILABLE');
        }

        const settings = await db.organizationReceivingSettings.findUnique({
          where: { organizationId: params.organizationId },
        });

        if (settings === null || !settings.pixEnabled) {
          throw new ReceivingSettingsError('PIX_DESTINATION_NOT_CONFIGURED');
        }

        if (
          settings.pixKeyType === null ||
          settings.pixKeyCiphertext === null ||
          settings.merchantName === null ||
          settings.merchantCity === null
        ) {
          throw new ReceivingSettingsError('RECEIVING_SETTINGS_UNAVAILABLE');
        }

        const charge = createReceivablePixCharge({
          receivableId: receivable.id,
          currency: receivable.currency,
          status: receivable.status,
          amountInCents: receivable.amountInCents,
          receivedInCents: receivable.receivedInCents,
          pixKeyType: settings.pixKeyType,
          pixKey: this.cipher.decrypt(params.organizationId, settings.pixKeyType, settings.pixKeyCiphertext),
          merchantName: settings.merchantName,
          merchantCity: settings.merchantCity,
        });

        return {
          ...charge,
          organizationId: params.organizationId,
          receivableId: receivable.id,
          receivableVersion: receivable.version,
          receivingSettingsVersion: settings.version,
          currency: 'brl',
          merchantName: settings.merchantName,
        };
      },
      {
        notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
        busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
      },
    );
  }
}

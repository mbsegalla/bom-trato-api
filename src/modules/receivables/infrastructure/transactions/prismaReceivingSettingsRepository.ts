import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { OrganizationActorParams } from '../../../organizations/application/ports/organizationUnitOfWork.port.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { ReceivingSettingsRepository } from '../../application/ports/receivingSettingsRepository.port.js';
import type {
  ReceivingSettings,
  ReceivingSettingsView,
  SaveReceivingSettingsInput,
} from '../../application/types/receivingSettings.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { ReceivingSettingsPolicy } from '../../domain/policies/receivingSettings.policy.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { ReceivingSettingsCipher } from '../security/receivingSettingsCipher.js';

const emptySettings: ReceivingSettings = {
  pixEnabled: false,
  pixKeyType: null,
  pixKey: null,
  merchantName: null,
  merchantCity: null,
};

@Injectable()
export class PrismaReceivingSettingsRepository extends ReceivingSettingsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: ReceivingSettingsCipher,
  ) {
    super();
  }

  read(params: OrganizationActorParams): Promise<ReceivingSettingsView> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const access = await assertReceivingSettingsOwner(db, params, false);
        const row = await db.organizationReceivingSettings.findUnique({
          where: { organizationId: params.organizationId },
        });
        let settings = emptySettings;

        if (row?.pixEnabled) {
          if (
            row.pixKeyType === null ||
            row.pixKeyCiphertext === null ||
            row.merchantName === null ||
            row.merchantCity === null
          ) {
            throw new ReceivingSettingsError('RECEIVING_SETTINGS_UNAVAILABLE');
          }

          settings = {
            pixEnabled: true,
            pixKeyType: row.pixKeyType,
            pixKey: this.cipher.decrypt(params.organizationId, row.pixKeyType, row.pixKeyCiphertext),
            merchantName: row.merchantName,
            merchantCity: row.merchantCity,
          };
        }

        return {
          ...settings,
          version: row?.version ?? 0,
          canConfigure: access.hasPlatformAccess && !access.billingNeedsReconciliation && this.cipher.available,
          encryptionAvailable: this.cipher.available,
        };
      },
      this.errors(),
    );
  }

  save(params: OrganizationActorParams, input: SaveReceivingSettingsInput): Promise<ReceivingSettingsView> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        await assertReceivingSettingsOwner(db, params, true);

        if (!this.cipher.available) {
          throw new ReceivingSettingsError('RECEIVING_SETTINGS_UNAVAILABLE');
        }

        const current = await db.organizationReceivingSettings.findUnique({
          where: { organizationId: params.organizationId },
          select: { version: true },
        });
        const settings = ReceivingSettingsPolicy.configure(input, current?.version ?? 0);
        const version = (current?.version ?? 0) + 1;
        const { pixKey, ...fields } = settings;
        const data = {
          ...fields,
          pixKeyCiphertext:
            pixKey !== null && settings.pixKeyType !== null
              ? this.cipher.encrypt(params.organizationId, settings.pixKeyType, pixKey)
              : null,
          version,
          updatedById: params.userId,
        };

        if (current === null) {
          await db.organizationReceivingSettings.create({ data: { ...data, organizationId: params.organizationId } });
        } else {
          const updated = await db.organizationReceivingSettings.updateMany({
            where: { organizationId: params.organizationId, version: input.version },
            data,
          });

          if (updated.count !== 1) {
            throw new ReceivingSettingsError('RECEIVING_SETTINGS_VERSION_CONFLICT');
          }
        }

        return { ...settings, version, canConfigure: true, encryptionAvailable: true };
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

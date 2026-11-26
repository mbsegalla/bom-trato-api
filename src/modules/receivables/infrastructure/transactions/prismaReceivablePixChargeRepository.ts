import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { ReceivablePixChargeRepository } from '../../application/ports/receivablePixChargeRepository.port.js';
import type { FindReceivableParams } from '../../application/types/receivable.types.js';
import type { ReceivablePixCharge } from '../../application/types/receivablePixCharge.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { assertReceivingSettingsOwner } from '../access/assertReceivingSettingsOwner.js';
import { ReceivingSettingsCipher } from '../security/receivingSettingsCipher.js';

import { readReceivablePixCharge } from './readReceivablePixCharge.js';

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

        return readReceivablePixCharge(db, this.cipher, params.organizationId, params.receivableId);
      },
      {
        notFound: () => new ReceivingSettingsError('ORGANIZATION_NOT_FOUND'),
        busy: () => new ReceivingSettingsError('RECEIVING_SETTINGS_BUSY'),
      },
    );
  }
}

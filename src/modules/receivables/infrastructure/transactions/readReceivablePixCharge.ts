import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ReceivablePixCharge } from '../../application/types/receivablePixCharge.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';
import { createReceivablePixCharge } from '../../domain/policies/receivablePixCharge.policy.js';
import type { ReceivingSettingsCipher } from '../security/receivingSettingsCipher.js';

export async function readReceivablePixCharge(
  db: Prisma.TransactionClient,
  cipher: ReceivingSettingsCipher,
  organizationId: string,
  receivableId: string,
): Promise<ReceivablePixCharge> {
  const receivable = await db.receivable.findFirst({
    where: { id: receivableId, organizationId },
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
    where: { organizationId },
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
    pixKey: cipher.decrypt(organizationId, settings.pixKeyType, settings.pixKeyCiphertext),
    merchantName: settings.merchantName,
    merchantCity: settings.merchantCity,
  });

  return {
    ...charge,
    organizationId,
    receivableId: receivable.id,
    receivableVersion: receivable.version,
    receivingSettingsVersion: settings.version,
    currency: 'brl',
    merchantName: settings.merchantName,
  };
}

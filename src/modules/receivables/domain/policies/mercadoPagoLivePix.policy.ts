import type { IssueMercadoPagoLivePixInput } from '../../application/types/mercadoPagoLivePix.types.js';
import { ReceivingSettingsError } from '../errors/receivingSettings.error.js';

export function assertLivePixInput(input: IssueMercadoPagoLivePixInput): void {
  if (
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    input.version > 2147483647 ||
    input.confirmed !== true ||
    typeof input.buyerEmail !== 'string' ||
    input.buyerEmail.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.buyerEmail) ||
    (input.buyerDocumentType !== 'CPF' && input.buyerDocumentType !== 'CNPJ') ||
    typeof input.buyerDocumentNumber !== 'string' ||
    !(input.buyerDocumentType === 'CPF' ? /^\d{11}$/ : /^\d{14}$/).test(input.buyerDocumentNumber)
  ) {
    throw new ReceivingSettingsError('MERCADO_PAGO_PIX_INVALID');
  }
}

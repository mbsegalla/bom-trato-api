import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { ReceivingSettingsErrorCode } from '../../domain/errors/receivingSettings.error.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  OWNER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  INVALID_RECEIVING_SETTINGS: HttpStatus.BAD_REQUEST,
  RECEIVING_SETTINGS_VERSION_CONFLICT: HttpStatus.CONFLICT,
  RECEIVING_SETTINGS_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  RECEIVING_SETTINGS_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
  RECEIVABLE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PIX_DESTINATION_NOT_CONFIGURED: HttpStatus.CONFLICT,
  PIX_CHARGE_NOT_AVAILABLE: HttpStatus.CONFLICT,
  PAYMENT_LINK_UNAVAILABLE: HttpStatus.NOT_FOUND,
  PAYMENT_LINK_VERSION_CONFLICT: HttpStatus.CONFLICT,
  MERCADO_PAGO_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  MERCADO_PAGO_OAUTH_INVALID: HttpStatus.BAD_REQUEST,
  MERCADO_PAGO_ACCOUNT_CONFLICT: HttpStatus.CONFLICT,
  MERCADO_PAGO_PIX_INVALID: HttpStatus.BAD_REQUEST,
  MERCADO_PAGO_PIX_CONFLICT: HttpStatus.CONFLICT,
} satisfies Record<ReceivingSettingsErrorCode, HttpStatus>;

export function receivingSettingsOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is ReceivingSettingsError => error instanceof ReceivingSettingsError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}

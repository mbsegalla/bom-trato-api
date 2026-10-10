import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { LeadErrorCode } from '../../domain/errors/lead.error.js';
import { LeadError } from '../../domain/errors/lead.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  LEAD_NOT_FOUND: HttpStatus.NOT_FOUND,
  PUBLIC_PROFILE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PUBLIC_SERVICE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_LEAD_NAME: HttpStatus.BAD_REQUEST,
  INVALID_LEAD_EMAIL: HttpStatus.BAD_REQUEST,
  INVALID_LEAD_PHONE: HttpStatus.BAD_REQUEST,
  INVALID_LEAD_MESSAGE: HttpStatus.BAD_REQUEST,
  LEAD_CONTACT_REQUIRED: HttpStatus.BAD_REQUEST,
  INVALID_LEAD_TRANSITION: HttpStatus.CONFLICT,
  LEAD_REQUEST_CONFLICT: HttpStatus.CONFLICT,
  LEAD_CUSTOMER_ARCHIVED: HttpStatus.CONFLICT,
  LEAD_CUSTOMER_CONFLICT: HttpStatus.CONFLICT,
  LEADS_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
} satisfies Record<LeadErrorCode, HttpStatus>;

export function leadOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is LeadError => error instanceof LeadError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}

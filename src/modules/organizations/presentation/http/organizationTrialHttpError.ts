import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { OrganizationTrialErrorCode } from '../../domain/errors/organizationTrial.error.js';
import { OrganizationTrialError } from '../../domain/errors/organizationTrial.error.js';

interface OrganizationTrialHttpErrorDefinition {
  status: HttpStatus;
  message: string;
}

const organizationTrialHttpErrors = {
  INVALID_TRIAL_PERIOD: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The trial period is invalid.',
  },
  INVALID_TRIAL_CONVERSION_DATE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The trial conversion date is invalid.',
  },
  INVALID_TRIAL_REVOCATION_DATE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The trial revocation date is invalid.',
  },
  TRIAL_ALREADY_USED: {
    status: HttpStatus.CONFLICT,
    message: 'The free trial has already been used by this account.',
  },
  TRIAL_NOT_AVAILABLE: {
    status: HttpStatus.CONFLICT,
    message: 'The free trial is not available for this organization.',
  },
  TRIAL_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Free trial not found.',
  },
} satisfies Record<OrganizationTrialErrorCode, OrganizationTrialHttpErrorDefinition>;

export function organizationTrialOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is OrganizationTrialError => error instanceof OrganizationTrialError,
    (error) => ({
      ...organizationTrialHttpErrors[error.code],
      code: error.code,
    }),
  );
}

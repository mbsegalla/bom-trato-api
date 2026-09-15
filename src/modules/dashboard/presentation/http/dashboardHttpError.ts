import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { DashboardErrorCode } from '../../domain/errors/dashboard.error.js';
import { DashboardError } from '../../domain/errors/dashboard.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  INVALID_DASHBOARD_PERIOD: HttpStatus.BAD_REQUEST,
  INVALID_DASHBOARD_LIMIT: HttpStatus.BAD_REQUEST,
  DASHBOARD_VALUE_OUT_OF_RANGE: HttpStatus.INTERNAL_SERVER_ERROR,
  DASHBOARD_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
} satisfies Record<DashboardErrorCode, HttpStatus>;

export function dashboardOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is DashboardError => error instanceof DashboardError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}

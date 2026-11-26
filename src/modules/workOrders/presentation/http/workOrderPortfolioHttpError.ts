import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { WorkOrderPortfolioErrorCode } from '../../domain/errors/workOrderPortfolio.error.js';
import { WorkOrderPortfolioError } from '../../domain/errors/workOrderPortfolio.error.js';

import { workOrderShareOperation } from './workOrderShareHttpError.js';

const statuses = {
  INVALID_PORTFOLIO_CONSENT: HttpStatus.BAD_REQUEST,
  PORTFOLIO_PHOTO_NOT_FOUND: HttpStatus.NOT_FOUND,
  PORTFOLIO_CONSENT_REQUIRED: HttpStatus.CONFLICT,
  PORTFOLIO_WORK_ORDER_NOT_COMPLETED: HttpStatus.CONFLICT,
} satisfies Record<WorkOrderPortfolioErrorCode, HttpStatus>;

export function workOrderPortfolioOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    () => workOrderShareOperation(operation),
    (error): error is WorkOrderPortfolioError => error instanceof WorkOrderPortfolioError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}

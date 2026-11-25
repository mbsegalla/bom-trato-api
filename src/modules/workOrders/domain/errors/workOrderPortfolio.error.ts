export type WorkOrderPortfolioErrorCode =
  | 'INVALID_PORTFOLIO_CONSENT'
  | 'PORTFOLIO_PHOTO_NOT_FOUND'
  | 'PORTFOLIO_CONSENT_REQUIRED'
  | 'PORTFOLIO_WORK_ORDER_NOT_COMPLETED';

export class WorkOrderPortfolioError extends Error {
  constructor(readonly code: WorkOrderPortfolioErrorCode) {
    super(code);
    this.name = WorkOrderPortfolioError.name;
  }
}

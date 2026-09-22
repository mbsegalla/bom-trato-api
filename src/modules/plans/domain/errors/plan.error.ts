export type PlanErrorCode = 'PLAN_NOT_FOUND' | 'PLAN_PRICE_NOT_FOUND';

export class PlanError extends Error {
  constructor(readonly code: PlanErrorCode) {
    super(code);

    this.name = 'PlanError';
  }
}

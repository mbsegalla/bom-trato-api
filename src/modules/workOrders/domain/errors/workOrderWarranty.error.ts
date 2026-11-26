export type WorkOrderWarrantyErrorCode =
  'INVALID_WORK_ORDER_WARRANTY' | 'WORK_ORDER_WARRANTY_LOCKED' | 'WORK_ORDER_WARRANTY_VERSION_CONFLICT';

export class WorkOrderWarrantyError extends Error {
  constructor(readonly code: WorkOrderWarrantyErrorCode) {
    super(code);
    this.name = 'WorkOrderWarrantyError';
  }
}

export type WorkOrderShareErrorCode = 'WORK_ORDER_SHARE_NOT_FOUND' | 'INVALID_WORK_ORDER_SHARE_EXPIRATION';

export class WorkOrderShareError extends Error {
  constructor(readonly code: WorkOrderShareErrorCode) {
    super(code);

    this.name = 'WorkOrderShareError';
  }
}

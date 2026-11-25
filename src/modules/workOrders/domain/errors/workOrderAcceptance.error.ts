export type WorkOrderAcceptanceErrorCode =
  | 'WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE'
  | 'WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT'
  | 'WORK_ORDER_ALREADY_ACCEPTED'
  | 'INVALID_WORK_ORDER_ACCEPTANCE_INPUT';

export class WorkOrderAcceptanceError extends Error {
  constructor(readonly code: WorkOrderAcceptanceErrorCode) {
    super(code);
    this.name = 'WorkOrderAcceptanceError';
  }
}

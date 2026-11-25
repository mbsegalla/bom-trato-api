export type WorkOrderChecklistErrorCode =
  | 'WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND'
  | 'INVALID_WORK_ORDER_CHECKLIST_INPUT'
  | 'WORK_ORDER_CHECKLIST_LIMIT_REACHED'
  | 'WORK_ORDER_CHECKLIST_VERSION_CONFLICT';

export class WorkOrderChecklistError extends Error {
  constructor(readonly code: WorkOrderChecklistErrorCode) {
    super(code);

    this.name = 'WorkOrderChecklistError';
  }
}

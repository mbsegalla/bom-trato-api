import type { WorkOrderProps } from './workOrder.types.js';

export type WorkOrderSummary = Pick<
  WorkOrderProps,
  | 'id'
  | 'organizationId'
  | 'quoteId'
  | 'customerId'
  | 'customerName'
  | 'title'
  | 'assignedToId'
  | 'status'
  | 'currency'
  | 'totalInCents'
  | 'scheduledStartAt'
  | 'scheduledEndAt'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
>;

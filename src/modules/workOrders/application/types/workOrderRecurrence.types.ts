import type { WorkOrderRecurrenceSettings } from '../../domain/policies/workOrderRecurrence.policy.js';

export interface WorkOrderRecurrenceView {
  recurrence: WorkOrderRecurrenceSettings | null;
  canConfigure: boolean;
  customerArchived: boolean;
  today: string;
  completedOn: string | null;
}

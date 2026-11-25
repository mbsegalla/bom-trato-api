import type { Page, PageParams } from '../../../../shared/types/page.types.js';
import type { WorkOrderRecurrenceSettings } from '../../domain/policies/workOrderRecurrence.policy.js';
import type { WorkOrderRecurrenceVisitPeriod } from '../../domain/policies/workOrderRecurrenceVisit.policy.js';

export interface WorkOrderRecurrenceView {
  recurrence: WorkOrderRecurrenceSettings | null;
  canConfigure: boolean;
  customerArchived: boolean;
  today: string;
  completedOn: string | null;
}

export type WorkOrderRecurrenceListStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface WorkOrderRecurrenceListInput extends PageParams {
  status?: WorkOrderRecurrenceListStatus;
  visit?: WorkOrderRecurrenceVisitPeriod;
  customerName?: string;
}

export interface WorkOrderRecurrenceListItem {
  workOrderId: string;
  title: string;
  customerId: string;
  customerName: string;
  customerArchived: boolean;
  recurrence: WorkOrderRecurrenceSettings;
}

export interface WorkOrderRecurrenceListView extends Page<WorkOrderRecurrenceListItem> {
  today: string;
  canConfigure: boolean;
}

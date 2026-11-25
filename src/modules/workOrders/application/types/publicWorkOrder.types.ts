import type {
  PublicWorkOrderFinancial,
  PublicWorkOrderReceivable,
} from '../../domain/policies/publicWorkOrderFinancial.policy.js';
import type {
  PublicWorkOrderTimelineEvent,
  PublicWorkOrderTimelineSource,
} from '../../domain/policies/publicWorkOrderTimeline.policy.js';
import type { WorkOrderItemProps, WorkOrderProps } from '../../domain/types/workOrder.types.js';

import type { PublicWorkOrderAcceptance } from './workOrderAcceptance.types.js';
import type { PublicWorkOrderChecklist, PublicWorkOrderChecklistItem } from './workOrderChecklist.types.js';
import type { PublicWorkOrderPhoto } from './workOrderPhoto.types.js';

export type PublicWorkOrderItem = Pick<
  WorkOrderItemProps,
  'name' | 'description' | 'unit' | 'quantityInThousandths' | 'unitAmountInCents' | 'totalInCents' | 'position'
>;

export interface PublicWorkOrderDetails extends Pick<
  WorkOrderProps,
  | 'title'
  | 'status'
  | 'currency'
  | 'subtotalInCents'
  | 'discountInCents'
  | 'totalInCents'
  | 'scheduledStartAt'
  | 'scheduledEndAt'
  | 'startedAt'
  | 'completedAt'
  | 'canceledAt'
  | 'createdAt'
> {
  responsibleName: string | null;
  items: PublicWorkOrderItem[];
}

export interface PublicWorkOrderSnapshot extends Omit<PublicWorkOrderDetails, 'responsibleName'> {
  id: string;
  organizationId: string;
  version: number;
  assignedToName: string | null;

  organization: {
    name: string;
    logoKey: string | null;
  };

  receivables: PublicWorkOrderReceivable[];
  timelineSource: PublicWorkOrderTimelineSource;
  photos: PublicWorkOrderPhoto[];
  checklistItems: PublicWorkOrderChecklistItem[];
  warranty?: { durationDays: number; terms: string } | null;
}

export interface PublicWorkOrderOrganization {
  name: string;
  logoUrl: string | null;
}

export interface PublicWorkOrderResult {
  organization: PublicWorkOrderOrganization;
  workOrder: PublicWorkOrderDetails;
  financial: PublicWorkOrderFinancial | null;
  timeline: PublicWorkOrderTimelineEvent[];
  photos: PublicWorkOrderPhoto[];
  checklist: PublicWorkOrderChecklist;
  warranty: { durationDays: number; terms: string; expiresAt: Date } | null;
  acceptance: PublicWorkOrderAcceptance;
  generatedAt: Date;
  expiresAt: Date;
}

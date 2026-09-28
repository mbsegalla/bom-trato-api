export type WorkOrderReviewInvitationSkipReason = 'NO_PUBLIC_PROFILE' | 'ORGANIZATION_CONTACT' | 'ALREADY_REVIEWED';

export interface QueueWorkOrderReviewInvitationParams {
  id: string;
  organizationId: string;
  workOrderId: string;
  createdById: string;
  customerEmail: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}

export type QueueWorkOrderReviewInvitationResult =
  | {
      queued: true;
      invitationId: string;
      recipient: string;
      organizationName: string;
    }
  | {
      queued: false;
      reason: WorkOrderReviewInvitationSkipReason;
    };

export abstract class WorkOrderReviewInvitationRepository {
  abstract queue(params: QueueWorkOrderReviewInvitationParams): Promise<QueueWorkOrderReviewInvitationResult>;
}

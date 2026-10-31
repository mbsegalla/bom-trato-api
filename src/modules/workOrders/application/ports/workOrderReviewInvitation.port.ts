export type WorkOrderReviewInvitationSkipReason = 'NO_PUBLIC_PROFILE' | 'ORGANIZATION_CONTACT' | 'ALREADY_REVIEWED';

export interface CreateWorkOrderReviewInvitationParams {
  id: string;
  organizationId: string;
  workOrderId: string;
  createdById: string;
  customerEmail: string | null;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}

export type CreateWorkOrderReviewInvitationResult =
  | {
      created: true;
      invitationId: string;
      recipientEmail: string | null;
      organizationName: string;
    }
  | {
      created: false;
      reason: WorkOrderReviewInvitationSkipReason;
    };

export abstract class WorkOrderReviewInvitationRepository {
  abstract create(params: CreateWorkOrderReviewInvitationParams): Promise<CreateWorkOrderReviewInvitationResult>;
}

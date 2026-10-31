import { randomUUID } from 'node:crypto';

import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { ReviewSecurity } from '../../../reviews/application/ports/reviewSecurity.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { WorkOrderByIdParams, WorkOrderReviewDeliveryResult } from '../types/workOrder.types.js';

const REVIEW_EXPIRATION_DAYS = 30;
const REVIEW_EXPIRATION_MS = REVIEW_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

export class SendWorkOrderReviewInvitationUseCase {
  constructor(
    private readonly processor: WorkOrderApplicationService,
    private readonly reviewSecurity: ReviewSecurity,
  ) {}

  execute(params: WorkOrderByIdParams): Promise<WorkOrderReviewDeliveryResult> {
    return this.processor.run(params, async (tx) => {
      const order = await this.processor.load(tx, params.workOrderId);

      const state = order.snapshot();

      if (state.status !== WorkOrderStatus.COMPLETED) {
        throw new WorkOrderError('WORK_ORDER_NOT_COMPLETED');
      }

      if (state.customerEmail === null && state.customerPhone === null) {
        throw new WorkOrderError('CUSTOMER_CONTACT_REQUIRED');
      }

      const now = new Date();
      const reviewToken = this.reviewSecurity.issue();
      const expiresAt = new Date(now.getTime() + REVIEW_EXPIRATION_MS);

      const invitation = await tx.reviewInvitations.create({
        id: randomUUID(),
        organizationId: state.organizationId,
        workOrderId: state.id,
        createdById: params.userId,
        customerEmail: state.customerEmail,
        tokenHash: reviewToken.hash,
        expiresAt,
        now,
      });

      if (!invitation.created) {
        switch (invitation.reason) {
          case 'NO_PUBLIC_PROFILE':
            throw new WorkOrderError('REVIEW_PUBLIC_PROFILE_REQUIRED');
          case 'ALREADY_REVIEWED':
            throw new WorkOrderError('REVIEW_ALREADY_SUBMITTED');
          case 'ORGANIZATION_CONTACT':
            throw new WorkOrderError('REVIEW_RECIPIENT_NOT_ALLOWED');
        }
      }

      if (invitation.recipientEmail !== null) {
        await tx.notifications.enqueue({
          key: `review-request/${invitation.invitationId}`,
          recipient: invitation.recipientEmail,
          content: {
            type: 'REVIEW_REQUEST',
            token: reviewToken.token,
            customerName: state.customerName,
            organizationName: invitation.organizationName,
            workOrderTitle: state.title,
          },
          expiresAt,
        });

        return {
          channel: 'EMAIL',
          recipient: invitation.recipientEmail,
          token: null,
          organizationName: invitation.organizationName,
        };
      }

      if (state.customerPhone === null) {
        throw new WorkOrderError('CUSTOMER_CONTACT_REQUIRED');
      }

      return {
        channel: 'WHATSAPP',
        recipient: state.customerPhone,
        token: reviewToken.token,
        organizationName: invitation.organizationName,
      };
    });
  }
}

import { randomUUID } from 'node:crypto';

import type { ReviewSecurity } from '../../../reviews/application/ports/reviewSecurity.port.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

const REVIEW_EXPIRATION_DAYS = 30;
const REVIEW_EXPIRATION_MS = REVIEW_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

export class CompleteWorkOrderUseCase {
  constructor(
    private readonly processor: WorkOrderApplicationService,
    private readonly reviewSecurity: ReviewSecurity,
  ) {}

  execute(params: ChangeWorkOrderParams) {
    return this.processor.mutate(params, async (order, tx, now) => {
      order.complete(now);

      const state = order.snapshot();

      if (state.customerEmail === null) {
        return;
      }

      const token = this.reviewSecurity.issue();
      const expiresAt = new Date(now.getTime() + REVIEW_EXPIRATION_MS);
      const invitationId = randomUUID();

      const invitation = await tx.reviewInvitations.queue({
        id: invitationId,
        organizationId: state.organizationId,
        workOrderId: state.id,
        createdById: params.userId,
        customerEmail: state.customerEmail,
        tokenHash: token.hash,
        expiresAt,
        now,
      });

      if (!invitation.queued) {
        return;
      }

      await tx.notifications.enqueue({
        key: `review-request/${invitation.invitationId}`,
        recipient: invitation.recipient,
        content: {
          type: 'REVIEW_REQUEST',
          token: token.token,
          customerName: state.customerName,
          organizationName: invitation.organizationName,
          workOrderTitle: state.title,
        },
        expiresAt,
      });
    });
  }
}

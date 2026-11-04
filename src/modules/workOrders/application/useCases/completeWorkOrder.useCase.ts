import { randomUUID } from 'node:crypto';

import { AutomationEntityType, AutomationType } from '../../../../generated/prisma/enums.js';
import { ensureFinalReceivableFromQuote } from '../../../receivables/application/services/receivableAutomation.service.js';
import type { ReviewSecurity } from '../../../reviews/application/ports/reviewSecurity.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

const REVIEW_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;

export class CompleteWorkOrderUseCase {
  constructor(
    private readonly processor: WorkOrderApplicationService,
    private readonly reviewSecurity: ReviewSecurity,
  ) {}

  execute(params: ChangeWorkOrderParams) {
    return this.processor.mutate(params, async (order, tx, now) => {
      order.complete(now);

      const state = order.snapshot();

      const quote = await tx.findQuote(state.quoteId);

      if (quote === null) {
        throw new WorkOrderError('QUOTE_NOT_FOUND');
      }

      const [dueDays, automationSettings] = await Promise.all([
        tx.findDefaultReceivableDueDays(),
        tx.findAutomationSettings(),
      ]);

      const dueAt = new Date(now);

      dueAt.setUTCDate(dueAt.getUTCDate() + dueDays);

      await ensureFinalReceivableFromQuote({
        receivables: tx.receivables,
        organizationId: state.organizationId,
        userId: params.userId,
        source: state,
        quote,
        dueAt,
        now,
      });

      if (!automationSettings.autoReviewRequestEnabled || state.customerEmail === null) {
        return;
      }

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

      if (!invitation.created || invitation.recipientEmail === null) {
        return;
      }

      await tx.notifications.enqueue({
        key: `automation/review-request/${invitation.invitationId}`,
        recipient: invitation.recipientEmail,
        content: {
          type: 'REVIEW_REQUEST',
          token: reviewToken.token,
          customerName: state.customerName,
          organizationName: invitation.organizationName,
          workOrderTitle: state.title,
        },
        expiresAt,
        automation: {
          organizationId: state.organizationId,
          type: AutomationType.REVIEW_REQUEST,
          entityType: AutomationEntityType.WORK_ORDER,
          entityId: state.id,
          contextId: invitation.invitationId,
          description: 'Solicitação automática de avaliação',
          href: `/work-orders/${state.id}`,
        },
      });
    });
  }
}

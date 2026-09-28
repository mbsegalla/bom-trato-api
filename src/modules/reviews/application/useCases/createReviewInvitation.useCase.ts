import { randomUUID } from 'node:crypto';

import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { WorkOrderApplicationService } from '../../../workOrders/application/services/workOrderApplicationService.service.js';
import { ReviewInvitation } from '../../domain/entities/reviewInvitation.entity.js';
import { ReviewError } from '../../domain/errors/review.error.js';
import type { ReviewRepository } from '../../domain/repositories/review.repository.js';
import type { ReviewSecurity } from '../ports/reviewSecurity.port.js';

const REVIEW_EXPIRATION_DAYS = 30;

interface CreateReviewInvitationProps {
  organizationId: string;
  userId: string;
  workOrderId: string;
}

export class CreateReviewInvitationUseCase {
  constructor(
    private readonly workOrders: WorkOrderApplicationService,
    private readonly reviews: ReviewRepository,
    private readonly security: ReviewSecurity,
  ) {}

  execute(params: CreateReviewInvitationProps) {
    const { organizationId, userId, workOrderId } = params;

    return this.workOrders.read(
      {
        organizationId,
        userId,
      },
      async (context) => {
        const order = await this.workOrders.load(context, workOrderId);

        const state = order.snapshot();

        if (state.status !== WorkOrderStatus.COMPLETED) {
          throw new ReviewError('REVIEW_WORK_ORDER_NOT_COMPLETED');
        }

        if (await this.reviews.hasReviewForWorkOrder(state.id)) {
          throw new ReviewError('REVIEW_ALREADY_SUBMITTED');
        }

        const profile = await this.reviews.findProfileForOrganization(organizationId);

        if (!profile) {
          throw new ReviewError('REVIEW_PUBLIC_PROFILE_REQUIRED');
        }

        const now = new Date();

        const expiresAt = new Date(now.getTime() + REVIEW_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

        const issued = this.security.issue();

        const invitation = ReviewInvitation.create({
          id: randomUUID(),
          publicBusinessProfileId: profile.id,
          workOrderId: state.id,
          tokenHash: issued.hash,
          createdById: params.userId,
          now,
          expiresAt,
        });

        await this.reviews.replaceInvitation(invitation);

        return {
          token: issued.token,
          expiresAt,
        };
      },
    );
  }
}

import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import { ProfessionalReview } from '../../domain/entities/professionalReview.entity.js';
import { ReviewInvitation } from '../../domain/entities/reviewInvitation.entity.js';
import { ReviewError } from '../../domain/errors/review.error.js';
import type { ReviewRepository } from '../../domain/repositories/review.repository.js';
import type { ReviewSecurity } from '../ports/reviewSecurity.port.js';

export class ResolveReviewInvitationUseCase {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly security: ReviewSecurity,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(token: string) {
    const hash = this.security.hash(token);

    const invitation = await this.reviews.resolveInvitation(hash);

    if (!invitation) {
      throw new ReviewError('REVIEW_INVITATION_NOT_FOUND');
    }

    ReviewInvitation.restore({
      id: invitation.id,
      publicBusinessProfileId: invitation.publicBusinessProfileId,
      workOrderId: invitation.workOrderId,
      tokenHash: invitation.tokenHash,
      createdById: invitation.createdById,
      expiresAt: invitation.expiresAt,
      revokedAt: invitation.revokedAt,
      usedAt: invitation.usedAt,
      createdAt: invitation.createdAt,
    }).assertUsable(new Date());

    if (invitation.reviewExists) {
      throw new ReviewError('REVIEW_ALREADY_SUBMITTED');
    }

    if (invitation.workOrderStatus !== WorkOrderStatus.COMPLETED) {
      throw new ReviewError('REVIEW_WORK_ORDER_NOT_COMPLETED');
    }

    return {
      businessName: invitation.businessName,
      logoUrl: invitation.logoKey ? this.storage.publicUrl(invitation.logoKey) : null,
      professionalSlug: invitation.professionalSlug,
      workOrderTitle: invitation.workOrderTitle,
      reviewerDisplayName: ProfessionalReview.displayName(invitation.customerName),
      expiresAt: invitation.expiresAt,
    };
  }
}

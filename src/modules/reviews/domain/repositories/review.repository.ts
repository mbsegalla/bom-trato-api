import type { ProfessionalReviewProps } from '../entities/professionalReview.entity.js';
import type { ReviewInvitation } from '../entities/reviewInvitation.entity.js';

export interface ReviewProfileReference {
  id: string;
  slug: string;
}

export interface ReviewInvitationView {
  id: string;
  publicBusinessProfileId: string;
  workOrderId: string;
  tokenHash: string;
  createdById: string;
  expiresAt: Date;
  revokedAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
  businessName: string;
  logoKey: string | null;
  professionalSlug: string;
  workOrderStatus: 'OPEN' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
  workOrderTitle: string;
  customerId: string;
  customerName: string;
  reviewExists: boolean;
}

export interface SubmitVerifiedReviewParams {
  id: string;
  tokenHash: string;
  rating: number;
  comment: string | null;
  now: Date;
}

export interface SubmittedReview {
  review: ProfessionalReviewProps;
  professionalSlug: string;
}

export abstract class ReviewRepository {
  abstract findProfileForOrganization(organizationId: string): Promise<ReviewProfileReference | null>;
  abstract hasReviewForWorkOrder(workOrderId: string): Promise<boolean>;
  abstract replaceInvitation(invitation: ReviewInvitation): Promise<void>;
  abstract resolveInvitation(tokenHash: string): Promise<ReviewInvitationView | null>;
  abstract submitVerifiedReview(params: SubmitVerifiedReviewParams): Promise<SubmittedReview>;
}

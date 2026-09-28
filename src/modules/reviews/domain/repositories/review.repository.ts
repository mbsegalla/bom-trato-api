import type { ProfessionalReviewProps } from '../entities/professionalReview.entity.js';

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
  abstract resolveInvitation(tokenHash: string): Promise<ReviewInvitationView | null>;
  abstract submitVerifiedReview(params: SubmitVerifiedReviewParams): Promise<SubmittedReview>;
}

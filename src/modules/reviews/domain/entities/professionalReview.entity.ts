import { ReviewError } from '../errors/review.error.js';

export interface ProfessionalReviewProps {
  id: string;
  publicBusinessProfileId: string;
  workOrderId: string;
  customerId: string;
  reviewerDisplayName: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export class ProfessionalReview {
  private constructor(private readonly props: ProfessionalReviewProps) {}

  static create(params: {
    id: string;
    publicBusinessProfileId: string;
    workOrderId: string;
    customerId: string;
    customerName: string;
    rating: number;
    comment: string | null;
    now: Date;
  }): ProfessionalReview {
    if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
      throw new ReviewError('INVALID_REVIEW_RATING');
    }

    const comment = params.comment?.trim() || null;

    if (comment !== null && comment.length > 1000) {
      throw new ReviewError('INVALID_REVIEW_COMMENT');
    }

    return new ProfessionalReview({
      id: params.id,
      publicBusinessProfileId: params.publicBusinessProfileId,
      workOrderId: params.workOrderId,
      customerId: params.customerId,
      reviewerDisplayName: ProfessionalReview.displayName(params.customerName),
      rating: params.rating,
      comment,
      createdAt: new Date(params.now),
    });
  }

  static restore(props: ProfessionalReviewProps): ProfessionalReview {
    return new ProfessionalReview(structuredClone(props));
  }

  static displayName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      return 'Cliente';
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 120);
    }

    const first = parts[0];
    const last = parts.at(-1)!;

    return `${first} ${last[0].toUpperCase()}.`.slice(0, 120);
  }

  static calculateReputationScore(ratingSum: number, ratingCount: number): number {
    if (ratingCount <= 0) {
      return 0;
    }

    const priorRating = 4;
    const priorWeight = 5;

    return Math.round(((ratingSum + priorRating * priorWeight) / (ratingCount + priorWeight)) * 1000);
  }

  snapshot(): ProfessionalReviewProps {
    return structuredClone(this.props);
  }
}

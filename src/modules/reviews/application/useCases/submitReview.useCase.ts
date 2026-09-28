import { randomUUID } from 'node:crypto';

import type { ReviewRepository } from '../../domain/repositories/review.repository.js';
import type { ReviewSecurity } from '../ports/reviewSecurity.port.js';

export class SubmitReviewUseCase {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly security: ReviewSecurity,
  ) {}

  async execute(
    token: string,
    input: {
      rating: number;
      comment: string | null;
    },
  ) {
    const result = await this.reviews.submitVerifiedReview({
      id: randomUUID(),
      tokenHash: this.security.hash(token),
      rating: input.rating,
      comment: input.comment,
      now: new Date(),
    });

    return {
      reviewerDisplayName: result.review.reviewerDisplayName,
      rating: result.review.rating,
      comment: result.review.comment,
      createdAt: result.review.createdAt,
      verified: true,
      professionalSlug: result.professionalSlug,
    };
  }
}

export type ReviewErrorCode =
  | 'REVIEW_INVITATION_NOT_FOUND'
  | 'REVIEW_INVITATION_EXPIRED'
  | 'REVIEW_ALREADY_SUBMITTED'
  | 'REVIEW_WORK_ORDER_NOT_COMPLETED'
  | 'INVALID_REVIEW_RATING'
  | 'INVALID_REVIEW_COMMENT';

export class ReviewError extends Error {
  constructor(readonly code: ReviewErrorCode) {
    super(code);

    this.name = ReviewError.name;
  }
}

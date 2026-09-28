import { ReviewError } from '../errors/review.error.js';

export interface ReviewInvitationProps {
  id: string;
  publicBusinessProfileId: string;
  workOrderId: string;
  tokenHash: string;
  createdById: string;
  expiresAt: Date;
  revokedAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
}

export class ReviewInvitation {
  private constructor(private props: ReviewInvitationProps) {}

  static create(params: {
    id: string;
    publicBusinessProfileId: string;
    workOrderId: string;
    tokenHash: string;
    createdById: string;
    now: Date;
    expiresAt: Date;
  }): ReviewInvitation {
    if (!Number.isFinite(params.expiresAt.getTime()) || params.expiresAt <= params.now) {
      throw new ReviewError('REVIEW_INVITATION_EXPIRED');
    }

    return new ReviewInvitation({
      id: params.id,
      publicBusinessProfileId: params.publicBusinessProfileId,
      workOrderId: params.workOrderId,
      tokenHash: params.tokenHash,
      createdById: params.createdById,
      expiresAt: new Date(params.expiresAt),
      revokedAt: null,
      usedAt: null,
      createdAt: new Date(params.now),
    });
  }

  static restore(props: ReviewInvitationProps): ReviewInvitation {
    return new ReviewInvitation(structuredClone(props));
  }

  assertUsable(now: Date): void {
    if (this.props.revokedAt !== null) {
      throw new ReviewError('REVIEW_INVITATION_NOT_FOUND');
    }

    if (this.props.usedAt !== null) {
      throw new ReviewError('REVIEW_ALREADY_SUBMITTED');
    }

    if (this.props.expiresAt <= now) {
      throw new ReviewError('REVIEW_INVITATION_EXPIRED');
    }
  }

  snapshot(): ReviewInvitationProps {
    return structuredClone(this.props);
  }
}

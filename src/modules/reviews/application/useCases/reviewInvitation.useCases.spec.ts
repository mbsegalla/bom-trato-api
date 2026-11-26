import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import type { ReviewRepository, ReviewInvitationView } from '../../domain/repositories/review.repository.js';
import { ResolveReviewInvitationUseCase } from './resolveReviewInvitation.useCase.js';
import { SubmitReviewUseCase } from './submitReview.useCase.js';

function fixture() {
  const now = new Date();
  const row: ReviewInvitationView = {
    id: 'invitation',
    publicBusinessProfileId: 'profile',
    workOrderId: 'order',
    tokenHash: 'hash',
    createdById: 'owner',
    expiresAt: new Date(now.getTime() + 86400000),
    revokedAt: null,
    usedAt: null,
    createdAt: now,
    businessName: 'Fixture',
    logoKey: 'logo-key',
    professionalSlug: 'fixture',
    workOrderStatus: 'COMPLETED',
    workOrderTitle: 'Fixture service',
    customerId: 'customer',
    customerName: 'Cliente Nome Privado',
    reviewExists: false,
  };
  const resolveInvitation = vi.fn<ReviewRepository['resolveInvitation']>().mockResolvedValue(row);
  const submitVerifiedReview = vi.fn<ReviewRepository['submitVerifiedReview']>().mockResolvedValue({
    review: {
      id: 'review',
      publicBusinessProfileId: 'profile',
      workOrderId: 'order',
      customerId: 'customer',
      reviewerDisplayName: 'Cliente P.',
      rating: 5,
      comment: null,
      createdAt: now
    },
    professionalSlug: 'fixture',
  });
  const publicUrl = vi.fn().mockReturnValue('https://assets.example.invalid/logo');
  const repository = { resolveInvitation, submitVerifiedReview };
  const security = { hash: vi.fn().mockReturnValue('hash'), issue: vi.fn() };

  return {
    row,
    resolveInvitation,
    submitVerifiedReview,
    publicUrl,
    security,
    resolve: new ResolveReviewInvitationUseCase(repository, security, { publicUrl } as unknown as ObjectStorage),
    submit: new SubmitReviewUseCase(repository, security)
  };
}

describe('review invitation use cases', () => {
  it('resolves a valid completed-service invitation without exposing private IDs or full customer name', async () => {
    const f = fixture();

    expect(await f.resolve.execute('fixture-token')).toEqual({
      businessName: 'Fixture',
      logoUrl: 'https://assets.example.invalid/logo',
      professionalSlug: 'fixture',
      workOrderTitle: 'Fixture service',
      reviewerDisplayName: 'Cliente P.',
      expiresAt: f.row.expiresAt,
    });
    expect(f.resolveInvitation).toHaveBeenCalledWith('hash');
  });

  it('rejects unknown, expired, revoked, used or unfinished-service invitations', async () => {
    const f = fixture();
    for (const [row, code] of [
      [null, 'REVIEW_INVITATION_NOT_FOUND'],
      [{ ...f.row, expiresAt: new Date(0) }, 'REVIEW_INVITATION_EXPIRED'],
      [{ ...f.row, revokedAt: new Date() }, 'REVIEW_INVITATION_NOT_FOUND'],
      [{ ...f.row, usedAt: new Date() }, 'REVIEW_ALREADY_SUBMITTED'],
      [{ ...f.row, reviewExists: true }, 'REVIEW_ALREADY_SUBMITTED'],
      [{ ...f.row, workOrderStatus: 'OPEN' as const }, 'REVIEW_WORK_ORDER_NOT_COMPLETED'],
    ] as const) {
      f.resolveInvitation.mockResolvedValueOnce(row);

      await expect(f.resolve.execute('fixture-token')).rejects.toThrow(code);
    }
    expect(f.publicUrl).not.toHaveBeenCalled();
  });

  it('delegates verified submission using the token hash and returns only public review fields', async () => {
    const f = fixture();

    const result = await f.submit.execute('fixture-token', { rating: 5, comment: null });

    expect(f.submitVerifiedReview).toHaveBeenCalledWith({
      id: expect.any(String),
      tokenHash: 'hash',
      rating: 5,
      comment: null,
      now: expect.any(Date)
    });
    expect(result).toEqual({
      reviewerDisplayName: 'Cliente P.',
      rating: 5,
      comment: null,
      createdAt: expect.any(Date),
      verified: true,
      professionalSlug: 'fixture'
    });
    expect(result).not.toHaveProperty('customerId');
    expect(result).not.toHaveProperty('workOrderId');
  });
});

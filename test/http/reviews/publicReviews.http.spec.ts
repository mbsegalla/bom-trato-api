import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResolveReviewInvitationUseCase } from '../../../src/modules/reviews/application/useCases/resolveReviewInvitation.useCase.js';
import { SubmitReviewUseCase } from '../../../src/modules/reviews/application/useCases/submitReview.useCase.js';
import { ReviewError } from '../../../src/modules/reviews/domain/errors/review.error.js';
import { PublicReviewsController } from '../../../src/modules/reviews/presentation/http/controllers/publicReviews.controller.js';
import { createHttpFixture } from '../support/http.fixture.js';

const token = 'a'.repeat(64);

describe('public review HTTP routes', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const resolve = vi.fn<ResolveReviewInvitationUseCase['execute']>();
  const submit = vi.fn<SubmitReviewUseCase['execute']>();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [PublicReviewsController],
      [
        { provide: ResolveReviewInvitationUseCase, useValue: { execute: resolve } },
        { provide: SubmitReviewUseCase, useValue: { execute: submit } },
      ],
    );
  });

  beforeEach(() => {
    resolve.mockReset();
    submit.mockReset();
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('rejects malformed tokens, ratings and extra properties before submission', async () => {
    for (const input of [
      { token: 'invalid', rating: 5 },
      { token, rating: 0 },
      { token, rating: 6 },
      { token, rating: 4.5 },
      {
        token,
        rating: 5,
        customerId: 'spoofed',
      },
    ]) {
      await request(fixture.server).post('/api/public/reviews/submit').send(input).expect(400);
    }
    expect(submit).not.toHaveBeenCalled();
  });

  it('accepts a public submission without bearer credentials and trims the review text', async () => {
    submit.mockResolvedValueOnce({
      reviewerDisplayName: 'Cliente T.',
      rating: 5,
      comment: 'Fixture',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      verified: true,
      professionalSlug: 'fixture',
    });

    const response = await request(fixture.server)
      .post('/api/public/reviews/submit')
      .send({
        token,
        rating: 5,
        comment: ' Fixture ',
      })
      .expect(201);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(submit).toHaveBeenCalledWith(token, { rating: 5, comment: 'Fixture' });
    expect(response.body.data).toMatchObject({ rating: 5, verified: true });
  });

  it('maps unknown, expired and consumed invitations without returning private data', async () => {
    for (const [code, status] of [
      ['REVIEW_INVITATION_NOT_FOUND', 404],
      ['REVIEW_INVITATION_EXPIRED', 410],
      ['REVIEW_ALREADY_SUBMITTED', 409],
    ] as const) {
      resolve.mockRejectedValueOnce(new ReviewError(code));

      const response = await request(fixture.server).post('/api/public/reviews/resolve').send({ token }).expect(status);

      expect(response.body.error.code).toBe(code);
      expect(JSON.stringify(response.body)).not.toContain(token);
    }
  });
});

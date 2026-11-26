import { randomBytes, randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { ProfessionalReview } from '../../../src/modules/reviews/domain/entities/professionalReview.entity.js';
import { PrismaReviewRepository } from '../../../src/modules/reviews/infrastructure/repositories/prismaReview.repository.js';
import { PrismaWorkOrderReviewInvitationRepository } from '../../../src/modules/workOrders/infrastructure/repositories/prismaWorkOrderReviewInvitation.repository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';
import { createWorkOrderFixture } from '../workOrders/support/workOrder.fixture.js';

databaseSuite('verified review persistence (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const f = await createWorkOrderFixture(db);
    const invitation = await f.reviewInvitation();
    const repository = new PrismaReviewRepository(db.prisma);
    const params = {
      id: randomUUID(),
      tokenHash: invitation.tokenHash,
      rating: 5,
      comment: '  Fixture verified review  ',
      now: new Date(),
    };

    return { ...f, invitation, repository, params };
  }

  it('consumes the invitation, anonymizes the reviewer and updates the reputation in the same transaction', async () => {
    const f = await fixture();
    const other = await f.reviewInvitation();
    const resolved = await f.repository.resolveInvitation(f.invitation.tokenHash);

    expect(resolved).toMatchObject({
      workOrderId: f.order.id, customerId: f.customer.id, professionalSlug: f.profile.slug, reviewExists: false,
    });

    const result = await f.repository.submitVerifiedReview(f.params);

    expect(result.review).toMatchObject({
      reviewerDisplayName: 'Fixture N.',
      rating: 5,
      comment: 'Fixture verified review',
      workOrderId: f.order.id,
    });
    expect(result.professionalSlug).toBe(f.profile.slug);

    const profile = await db.prisma.publicBusinessProfile.findUniqueOrThrow({ where: { id: f.profile.id } });
    expect(profile).toMatchObject({
      ratingSum: 5,
      ratingCount: 1,
      reputationScore: ProfessionalReview.calculateReputationScore(5, 1),
    });
    expect(await db.prisma.professionalReviewInvitation.findUniqueOrThrow({ where: { id: f.invitation.id } }))
      .toMatchObject({ usedAt: f.params.now });
    expect(await db.prisma.professionalReviewInvitation.findUniqueOrThrow({ where: { id: other.id } }))
      .toMatchObject({ revokedAt: f.params.now });
    expect(await f.repository.resolveInvitation(f.invitation.tokenHash)).toMatchObject({ reviewExists: true });
  });

  it('prevents concurrent duplicate submissions and increments the profile aggregates exactly once', async () => {
    const f = await fixture();

    const results = await Promise.allSettled([
      f.repository.submitVerifiedReview(f.params),
      f.repository.submitVerifiedReview({ ...f.params, id: randomUUID(), rating: 4 }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');

    expect(rejected?.reason).toMatchObject({ code: 'REVIEW_ALREADY_SUBMITTED' });

    const reviews = await db.prisma.professionalReview.findMany({ where: { workOrderId: f.order.id } });
    expect(reviews).toHaveLength(1);
    const profile = await db.prisma.publicBusinessProfile.findUniqueOrThrow({ where: { id: f.profile.id } });
    expect(profile).toMatchObject({ ratingCount: 1, ratingSum: reviews[0]!.rating });
  }, 30000);

  it('rejects invalid ratings, revoked or expired tokens and uncompleted services without mutating reputation', async () => {
    const f = await fixture();

    await expect(f.repository.submitVerifiedReview({ ...f.params, rating: 6 })).rejects.toThrow('INVALID_REVIEW_RATING');
    await expect(f.repository.submitVerifiedReview({ ...f.params, now: f.invitation.expiresAt }))
      .rejects.toThrow('REVIEW_INVITATION_EXPIRED');

    await db.prisma.workOrder.update({ where: { id: f.order.id }, data: { status: 'IN_PROGRESS', completedAt: null } });
    await expect(f.repository.submitVerifiedReview(f.params)).rejects.toThrow('REVIEW_WORK_ORDER_NOT_COMPLETED');

    await db.prisma.professionalReviewInvitation.update({
      where: { id: f.invitation.id }, data: { revokedAt: f.params.now },
    });
    await expect(f.repository.submitVerifiedReview(f.params)).rejects.toThrow('REVIEW_INVITATION_NOT_FOUND');

    expect(await db.prisma.professionalReview.count({ where: { workOrderId: f.order.id } })).toBe(0);
    expect(await db.prisma.publicBusinessProfile.findUniqueOrThrow({ where: { id: f.profile.id } }))
      .toMatchObject({ ratingCount: 0, ratingSum: 0 });
  });

  it('rejects invitations to the business owner and rotates earlier unused invitations for a real customer', async () => {
    const f = await fixture();
    const owner = await db.prisma.user.findUniqueOrThrow({ where: { id: f.actor.userId } });

    const input = {
      id: randomUUID(),
      organizationId: f.actor.organizationId,
      workOrderId: f.order.id,
      createdById: f.actor.userId,
      customerEmail: f.customer.email,
      tokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 3600000),
      now: new Date(),
    };

    const issue = (params: typeof input) => db.prisma.$transaction((tx) =>
      new PrismaWorkOrderReviewInvitationRepository(tx, f.actor.organizationId).create(params));

    expect(await issue({ ...input, customerEmail: owner.email.toUpperCase() }))
      .toEqual({ created: false, reason: 'ORGANIZATION_CONTACT' });
    expect(await issue(input)).toMatchObject({ created: true, invitationId: input.id, recipientEmail: f.customer.email });
    expect(await db.prisma.professionalReviewInvitation.findUniqueOrThrow({ where: { id: f.invitation.id } }))
      .toMatchObject({ revokedAt: input.now });
    expect(await db.prisma.professionalReviewInvitation.findUniqueOrThrow({ where: { id: input.id } }))
      .toMatchObject({ tokenHash: input.tokenHash, revokedAt: null, usedAt: null });
  });
});

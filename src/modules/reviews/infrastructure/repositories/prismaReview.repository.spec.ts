import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

import { PrismaReviewRepository } from './prismaReview.repository.js';

const now = new Date('2026-01-01T12:00:00Z');
const row = {
  id: 'invitation',
  publicBusinessProfileId: 'profile',
  workOrderId: 'order',
  tokenHash: 'a'.repeat(64),
  createdById: 'owner',
  expiresAt: new Date(now.getTime() + 3600000),
  revokedAt: null,
  usedAt: null,
  createdAt: now,
  publicBusinessProfile: {
    slug: 'fixture-business',
    ratingSum: 8,
    ratingCount: 2,
    organization: { name: 'Fixture business', logoKey: null },
  },
  workOrder: {
    id: 'order',
    status: 'COMPLETED',
    title: 'Fixture service',
    customerId: 'customer',
    customerName: 'Fixture Customer',
    professionalReview: null,
  },
};
const params = { id: 'review', tokenHash: row.tokenHash, rating: 5, comment: '  Excellent service  ', now };

function fixture() {
  const invitation = vi.fn().mockResolvedValue(row);
  const existing = vi.fn().mockResolvedValue(null);
  const create = vi.fn().mockResolvedValue(undefined);
  const profile = vi.fn().mockResolvedValue(undefined);
  const consume = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    professionalReviewInvitation: { findUnique: invitation, updateMany: consume },
    professionalReview: { findUnique: existing, create },
    publicBusinessProfile: { update: profile },
  };
  const transaction = vi.fn(async (operation: (context: typeof tx) => Promise<unknown>) => operation(tx));
  const repository = new PrismaReviewRepository({ ...tx, $transaction: transaction } as unknown as PrismaService);

  return { repository, invitation, existing, create, profile, consume, transaction };
}

describe('PrismaReviewRepository', () => {
  it('resolves invitation details from trusted order and profile records', async () => {
    const f = fixture();

    expect(await f.repository.resolveInvitation(row.tokenHash)).toMatchObject({
      id: row.id,
      businessName: 'Fixture business',
      professionalSlug: 'fixture-business',
      workOrderTitle: 'Fixture service',
      customerName: 'Fixture Customer',
      reviewExists: false,
    });
    f.invitation.mockResolvedValueOnce({
      ...row,
      workOrder: { ...row.workOrder, professionalReview: { id: 'existing' } },
    });
    expect(await f.repository.resolveInvitation(row.tokenHash)).toMatchObject({ reviewExists: true });
    f.invitation.mockResolvedValueOnce(null);
    expect(await f.repository.resolveInvitation(row.tokenHash)).toBeNull();
    expect(f.invitation).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: row.tokenHash } }));
  });

  it('persists an anonymized review, updates reputation and invalidates other invitations in a transaction', async () => {
    const f = fixture();
    const result = await f.repository.submitVerifiedReview(params);

    expect(result).toEqual({
      professionalSlug: 'fixture-business',
      review: {
        id: 'review',
        publicBusinessProfileId: 'profile',
        workOrderId: 'order',
        customerId: 'customer',
        reviewerDisplayName: 'Fixture C.',
        rating: 5,
        comment: 'Excellent service',
        createdAt: now,
      },
    });
    expect(f.transaction).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledWith({ data: result.review });
    expect(f.profile).toHaveBeenCalledWith({
      where: { id: 'profile' },
      data: { ratingSum: 13, ratingCount: 3, reputationScore: 4125 },
    });
    expect(f.consume).toHaveBeenNthCalledWith(1, {
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    expect(f.consume).toHaveBeenNthCalledWith(2, {
      where: { workOrderId: row.workOrderId, id: { not: row.id }, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  it.each([
    [null, 'REVIEW_INVITATION_NOT_FOUND'],
    [{ ...row, revokedAt: now }, 'REVIEW_INVITATION_NOT_FOUND'],
    [{ ...row, expiresAt: now }, 'REVIEW_INVITATION_EXPIRED'],
    [{ ...row, usedAt: now }, 'REVIEW_ALREADY_SUBMITTED'],
    [{ ...row, workOrder: { ...row.workOrder, status: 'IN_PROGRESS' } }, 'REVIEW_WORK_ORDER_NOT_COMPLETED'],
  ] as const)('rejects unusable invitations before any writes: %j', async (invitation, code) => {
    const f = fixture();
    f.invitation.mockResolvedValueOnce(invitation);

    await expect(f.repository.submitVerifiedReview(params)).rejects.toThrow(code);

    expect(f.create).not.toHaveBeenCalled();
    expect(f.profile).not.toHaveBeenCalled();
    expect(f.consume).not.toHaveBeenCalled();
  });

  it('rejects duplicate reviews and lost invitation consumption races', async () => {
    const f = fixture();
    f.existing.mockResolvedValueOnce({ id: 'existing' });

    await expect(f.repository.submitVerifiedReview(params)).rejects.toThrow('REVIEW_ALREADY_SUBMITTED');
    expect(f.create).not.toHaveBeenCalled();

    f.consume.mockResolvedValueOnce({ count: 0 });

    await expect(f.repository.submitVerifiedReview(params)).rejects.toThrow('REVIEW_ALREADY_SUBMITTED');
    expect(f.consume).toHaveBeenCalledTimes(1);
  });

  it('maps unique-constraint races without hiding unrelated database errors', async () => {
    const f = fixture();
    const conflict = new Prisma.PrismaClientKnownRequestError('Fixture conflict', {
      code: 'P2002',
      clientVersion: 'fixture',
    });
    const failure = new Error('Fixture database failure');
    f.create.mockRejectedValueOnce(conflict).mockRejectedValueOnce(failure);

    await expect(f.repository.submitVerifiedReview(params)).rejects.toThrow('REVIEW_ALREADY_SUBMITTED');
    await expect(f.repository.submitVerifiedReview(params)).rejects.toBe(failure);

    expect(f.profile).not.toHaveBeenCalled();
    expect(f.consume).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { SubscriptionProps } from '../../domain/entities/subscription.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import { GetSubscriptionUseCase } from './getSubscription.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };

function fixture() {
  const assertMember = vi.fn<BillingRepository['assertMember']>().mockResolvedValue(undefined);
  const currentSubscription = vi.fn<BillingRepository['currentSubscription']>().mockResolvedValue(null);
  const useCase = new GetSubscriptionUseCase({ assertMember, currentSubscription } as unknown as BillingRepository);

  return { useCase, assertMember, currentSubscription };
}

describe('GetSubscriptionUseCase', () => {
  it('does not read subscription data for a nonmember', async () => {
    const f = fixture();
    f.assertMember.mockRejectedValueOnce(new BillingError('ORGANIZATION_NOT_FOUND'));

    await expect(f.useCase.execute(actor)).rejects.toThrow('ORGANIZATION_NOT_FOUND');

    expect(f.currentSubscription).not.toHaveBeenCalled();
  });

  it('returns null when no subscription exists', async () => {
    const f = fixture();

    expect(await f.useCase.execute(actor)).toBeNull();
    expect(f.assertMember).toHaveBeenCalledWith(actor.organizationId, actor.userId);
    expect(f.currentSubscription).toHaveBeenCalledWith(actor.organizationId);
  });

  it('returns a public view without remote identifiers and reflects expired access', async () => {
    const f = fixture();
    const state: SubscriptionProps = {
      id: 'subscription',
      organizationId: actor.organizationId,
      planPriceId: 'price',
      stripeSubscriptionId: 'sub_private',
      status: 'ACTIVE',
      currentPeriodStart: new Date('2020-01-01'),
      currentPeriodEnd: new Date('2020-02-01'),
      paidThrough: new Date('2020-02-01'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      endedAt: null,
      stripeCreatedAt: new Date('2020-01-01'),
    };
    f.currentSubscription.mockResolvedValueOnce(state);

    const result = await f.useCase.execute(actor);

    expect(result).toMatchObject({ id: state.id, organizationId: actor.organizationId, hasAccess: false });
    expect(result).not.toHaveProperty('stripeSubscriptionId');

    f.currentSubscription.mockResolvedValueOnce({ ...state, paidThrough: new Date(Date.now() + 60_000) });

    expect(await f.useCase.execute(actor)).toMatchObject({ hasAccess: true });
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { SubscriptionCancellationService } from '../services/subscriptionCancellationService.service.js';
import { CancelSubscriptionUseCase } from './cancelSubscription.useCase.js';
import { ResumeSubscriptionUseCase } from './resumeSubscription.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };

describe('subscription cancellation actions', () => {
  it('keeps cancellation and resumption distinct while forwarding the actor', async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    const processor = { apply } as unknown as SubscriptionCancellationService;

    await new CancelSubscriptionUseCase(processor).execute(actor);
    await new ResumeSubscriptionUseCase(processor).execute(actor);

    expect(apply.mock.calls).toEqual([
      [{ ...actor, cancelAtPeriodEnd: true }],
      [{ ...actor, cancelAtPeriodEnd: false }],
    ]);
  });

  it('propagates cancellation processor failures', async () => {
    const error = new Error('billing unavailable');
    const apply = vi.fn().mockRejectedValue(error);
    const processor = { apply } as unknown as SubscriptionCancellationService;

    await expect(new CancelSubscriptionUseCase(processor).execute(actor)).rejects.toBe(error);
    await expect(new ResumeSubscriptionUseCase(processor).execute(actor)).rejects.toBe(error);
  });
});

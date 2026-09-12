import { Subscription } from '../../domain/entities/subscription.entity.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { ReadSubscriptionParams } from '../types/readBilling.types.js';

export class GetSubscriptionUseCase {
  constructor(private readonly billingRepository: BillingRepository) {}

  async execute(params: ReadSubscriptionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertMember(organizationId, userId);

    const state = await this.billingRepository.currentSubscription(organizationId);

    return state === null ? null : Subscription.restore(state).toPublic(new Date());
  }
}

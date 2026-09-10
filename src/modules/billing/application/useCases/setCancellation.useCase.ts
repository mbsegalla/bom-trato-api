import { Subscription } from '../../domain/entities/subscription.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';

export interface SetCancellationParams {
  organizationId: string;
  userId: string;
  cancelAtPeriodEnd: boolean;
}

export class SetCancellationUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly billingGateway: BillingGateway,
    private readonly billingLock: BillingLock,
    private readonly planChangeRepository: PlanChangeRepository,
  ) {}

  async execute(params: SetCancellationParams): Promise<void> {
    const { organizationId, userId, cancelAtPeriodEnd } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    await this.billingLock.run(`organization:${organizationId}`, async () => {
      if ((await this.planChangeRepository.active(organizationId)) !== null) {
        throw new BillingError('PLAN_CHANGE_CONFLICT');
      }

      const customer = await this.billingRepository.customer(organizationId);

      if (customer.stripeCustomerId === null) {
        throw new BillingError('SUBSCRIPTION_NOT_FOUND');
      }

      await this.billingRepository.saveSnapshot({
        organizationId,
        snapshot: await this.billingGateway.snapshot(customer.stripeCustomerId),
      });

      const state = await this.billingRepository.currentSubscription(organizationId);

      if (state === null) {
        throw new BillingError('SUBSCRIPTION_NOT_FOUND');
      }

      const subscription = Subscription.restore(state);

      subscription.assertCanChangeCancellation();

      if (state.cancelAtPeriodEnd !== cancelAtPeriodEnd) {
        await this.billingGateway.setCancellation(state.stripeSubscriptionId, cancelAtPeriodEnd);
      }

      await this.billingRepository.saveSnapshot({
        organizationId,
        snapshot: await this.billingGateway.snapshot(customer.stripeCustomerId),
      });
    });
  }
}

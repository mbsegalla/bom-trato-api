import type { BillingGateway } from '../../../billing/application/ports/billingGateway.port.js';
import type { BillingLock } from '../../../billing/application/ports/billingLock.port.js';
import { BillingError } from '../../../billing/domain/errors/billing.error.js';
import type { BillingRepository } from '../../../billing/domain/repositories/billing.repository.js';
import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingState } from '../../domain/types/onboarding.types.js';
import type { OnboardingApplicationService } from '../services/onboardingApplicationService.service.js';

export class SelectOnboardingPlanUseCase {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly onboardingApplicationService: OnboardingApplicationService,
    private readonly billingRepository: BillingRepository,
    private readonly billingGateway: BillingGateway,
    private readonly billingLock: BillingLock,
  ) {}

  async execute(userId: string, organizationId: string, planPriceId: string): Promise<OnboardingState> {
    await this.billingRepository.assertOwner(organizationId, userId);

    await this.billingRepository.availablePrice(planPriceId);

    await this.billingLock.run(`organization:${organizationId}`, async () => {
      await this.expireConflictingCheckout(organizationId, planPriceId);

      await this.onboardingRepository.selectPlan(userId, organizationId, planPriceId);
    });

    return this.onboardingApplicationService.state(userId, organizationId);
  }

  private async expireConflictingCheckout(organizationId: string, planPriceId: string): Promise<void> {
    const attempt = await this.billingRepository.pendingCheckout(organizationId);

    if (attempt === null || attempt.planPriceId === planPriceId) {
      return;
    }

    const customer = await this.billingRepository.customer(organizationId);

    const session =
      attempt.stripeSessionId !== null
        ? await this.billingGateway.checkout(attempt.stripeSessionId)
        : customer.stripeCustomerId !== null
          ? await this.billingGateway.findCheckout(customer.stripeCustomerId, attempt.id)
          : null;

    if (session === null) {
      await this.billingRepository.closeCheckout(attempt.id, 'EXPIRED');

      return;
    }

    if (attempt.stripeSessionId !== session.stripeSessionId) {
      await this.billingRepository.attachCheckout(attempt.id, session.stripeSessionId);
    }

    if (session.status === 'COMPLETE') {
      await this.billingRepository.closeCheckout(attempt.id, 'COMPLETE');

      throw new BillingError('SUBSCRIPTION_EXISTS');
    }

    if (session.status === 'EXPIRED') {
      await this.billingRepository.closeCheckout(attempt.id, 'EXPIRED');

      return;
    }

    const expired = await this.billingGateway.expireCheckout(session.stripeSessionId);

    if (expired.status === 'COMPLETE') {
      await this.billingRepository.closeCheckout(attempt.id, 'COMPLETE');

      throw new BillingError('SUBSCRIPTION_EXISTS');
    }

    if (expired.status !== 'EXPIRED') {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    await this.billingRepository.closeCheckout(attempt.id, 'EXPIRED');
  }
}

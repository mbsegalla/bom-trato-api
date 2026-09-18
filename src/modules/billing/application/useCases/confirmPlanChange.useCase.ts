import { PlanChange } from '../../domain/entities/planChange.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PlanChangeGateway } from '../ports/planChangeGateway.port.js';
import type { PlanChangeProcessor } from '../services/planChangeProcessor.service.js';
import type { PlanChangeActionParams } from '../types/billing.types.js';

export class ConfirmPlanChangeUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly billingGateway: BillingGateway,
    private readonly planChangeGateway: PlanChangeGateway,
    private readonly billingLock: BillingLock,
    private readonly processor: PlanChangeProcessor,
  ) {}

  async execute(params: PlanChangeActionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      const change = await this.processor.ownedChange(params);

      if (!change.isQuoted()) {
        return this.processor.refresh(change);
      }

      if (change.isQuoteExpired(new Date())) {
        change.markExpired();

        await this.planChangeRepository.save(change);

        return change.toPublic();
      }

      if ((await this.planChangeRepository.active(organizationId)) !== null) {
        throw new BillingError('PLAN_CHANGE_CONFLICT');
      }

      const state = change.snapshot();

      const target = await this.billingRepository.availablePrice(state.targetPlanPriceId);

      await this.billingGateway.validatePrice(target);

      const targetInfo = await this.planChangeRepository.priceInfo(state.targetPlanPriceId);

      if (
        target.stripePriceId !== state.targetStripePriceId ||
        target.amountInCents !== state.targetAmountInCents ||
        targetInfo.maxUsers !== state.targetMaxUsers
      ) {
        throw new BillingError('PRICE_MISMATCH');
      }

      const source = await this.planChangeGateway.source({
        customerId: state.stripeCustomerId,
        subscriptionId: state.stripeSubscriptionId,
      });

      if (
        source.stripeItemId !== state.stripeItemId ||
        source.stripePriceId !== state.sourceStripePriceId ||
        source.periodStart !== state.periodStart ||
        source.periodEnd !== state.periodEnd ||
        (await this.planChangeGateway.preview(state)) !== state.amountDueNow
      ) {
        throw new BillingError('PLAN_CHANGE_QUOTE_EXPIRED');
      }

      const reserved = await this.planChangeRepository.reserve(state.id);

      return this.processor.execute(PlanChange.restore(reserved));
    });
  }
}

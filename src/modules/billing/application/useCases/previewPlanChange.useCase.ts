import { randomUUID } from 'node:crypto';

import type { CreatePlanChangeParams } from '../../domain/entities/planChange.entity.js';
import { PlanChange } from '../../domain/entities/planChange.entity.js';
import { Subscription } from '../../domain/entities/subscription.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PlanChangeGateway } from '../ports/planChangeGateway.port.js';
import type { PreviewPlanChangeParams } from '../types/billing.types.js';

export class PreviewPlanChangeUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly billingGateway: BillingGateway,
    private readonly planChangeGateway: PlanChangeGateway,
    private readonly billingLock: BillingLock,
  ) {}

  async execute(params: PreviewPlanChangeParams) {
    const { organizationId, planPriceId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      await this.billingRepository.assertOwner(organizationId, userId);

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

      const subscription = await this.billingRepository.currentSubscription(organizationId);

      if (subscription === null || !Subscription.restore(subscription).hasAccessAt(new Date())) {
        throw new BillingError('INVALID_SUBSCRIPTION_STATE');
      }

      const targetPrice = await this.billingRepository.availablePrice(planPriceId);

      await this.billingGateway.validatePrice(targetPrice);

      const sourceInfo = await this.planChangeRepository.priceInfo(subscription.planPriceId);

      const targetInfo = await this.planChangeRepository.priceInfo(planPriceId);

      const mode = PlanChange.determineMode({
        source: sourceInfo,
        target: targetInfo,
      });

      const source = await this.planChangeGateway.source({
        customerId: customer.stripeCustomerId,
        subscriptionId: subscription.stripeSubscriptionId,
      });

      const now = Math.floor(Date.now() / 1000);

      if (source.periodEnd - now < 600) {
        throw new BillingError('PLAN_CHANGE_CONFLICT');
      }

      const params: CreatePlanChangeParams = {
        id: randomUUID(),
        organizationId,
        requestedById: userId,
        sourcePlanPriceId: subscription.planPriceId,
        targetPlanPriceId: planPriceId,
        targetMaxUsers: targetInfo.maxUsers,
        stripeCustomerId: customer.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeItemId: source.stripeItemId,
        sourceStripePriceId: source.stripePriceId,
        targetStripePriceId: targetPrice.stripePriceId,
        mode,
        currency: targetInfo.currency,
        amountDueNow: 0,
        targetAmountInCents: targetInfo.amountInCents,
        targetInterval: targetInfo.interval,
        targetIntervalCount: targetInfo.intervalCount,
        periodStart: source.periodStart,
        periodEnd: source.periodEnd,
        prorationDate: now,
        expiresAt: new Date((now + 300) * 1000),
      };

      const draft = PlanChange.create(params);

      const amountDueNow = await this.planChangeGateway.preview(draft.snapshot());

      const change = PlanChange.create({
        ...params,
        amountDueNow,
      });

      await this.planChangeRepository.create(change);

      return change.toPublic();
    });
  }
}

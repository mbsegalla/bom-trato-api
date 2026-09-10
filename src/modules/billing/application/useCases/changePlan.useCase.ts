import { randomUUID } from 'node:crypto';

import type { CreatePlanChangeParams } from '../../domain/entities/planChange.entity.js';
import { PlanChange } from '../../domain/entities/planChange.entity.js';
import { Subscription } from '../../domain/entities/subscription.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PlanChangeGateway, RemotePlanChangeState } from '../ports/planChangeGateway.port.js';

export interface PlanChangeOwnerParams {
  organizationId: string;
  userId: string;
}

export interface PreviewPlanChangeParams extends PlanChangeOwnerParams {
  planPriceId: string;
}

export interface PlanChangeActionParams extends PlanChangeOwnerParams {
  changeId: string;
}

export class ChangePlanUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly billingGateway: BillingGateway,
    private readonly planChangeGateway: PlanChangeGateway,
    private readonly billingLock: BillingLock,
  ) {}

  private async ownedChange(params: PlanChangeActionParams): Promise<PlanChange> {
    const { organizationId, userId, changeId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    const stored = await this.planChangeRepository.find(changeId);

    if (stored === null) {
      throw new BillingError('PLAN_CHANGE_NOT_FOUND');
    }

    const change = PlanChange.restore(stored);

    change.assertBelongsTo(organizationId);

    return change;
  }

  async preview({ organizationId, userId, planPriceId }: PreviewPlanChangeParams) {
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

  async confirm(params: PlanChangeActionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      const change = await this.ownedChange(params);

      if (!change.isQuoted()) {
        return this.refresh(change);
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

      return this.execute(PlanChange.restore(reserved));
    });
  }

  async read(params: PlanChangeActionParams) {
    const change = await this.ownedChange(params);
    const state = change.snapshot();

    if (state.status !== 'PENDING_PAYMENT') {
      return change.toPublic();
    }

    const remote = await this.planChangeGateway.inspect(state);

    return change.toPublic(remote?.status === 'PENDING_PAYMENT' ? remote.clientSecret : null);
  }

  async sync(params: PlanChangeActionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () =>
      this.refresh(await this.ownedChange(params)),
    );
  }

  async cancel(params: PlanChangeActionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      const change = await this.ownedChange(params);

      if (change.isTerminal()) {
        return change.toPublic();
      }

      change.assertCanRequestCancellation(new Date());

      if (change.isQuoted()) {
        change.markCanceled();

        await this.planChangeRepository.save(change);

        return change.toPublic();
      }

      await this.planChangeGateway.cancel(change.snapshot());

      return this.refresh(change);
    });
  }

  async reconcile(organizationId: string): Promise<void> {
    await this.billingLock.run(`organization:${organizationId}`, async () => {
      const stored = await this.planChangeRepository.active(organizationId);

      if (stored !== null) {
        await this.refresh(PlanChange.restore(stored));
      }
    });
  }

  private async execute(change: PlanChange) {
    return this.saveRemote(change, await this.planChangeGateway.execute(change.snapshot()));
  }

  private async refresh(change: PlanChange) {
    if (change.isQuoted() || change.isTerminal()) {
      return change.toPublic();
    }

    const state = change.snapshot();
    const remote = await this.planChangeGateway.inspect(state);

    if (remote !== null) {
      return this.saveRemote(change, remote);
    }

    if (
      !change.isProcessing() ||
      state.startedAt === null ||
      Date.now() - state.startedAt.getTime() >= 23 * 60 * 60 * 1000 ||
      Date.now() >= state.periodEnd * 1000
    ) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    return this.execute(change);
  }

  private async saveRemote(change: PlanChange, remote: RemotePlanChangeState) {
    switch (remote.status) {
      case 'PENDING_PAYMENT':
        change.markPaymentPending();
        break;

      case 'SCHEDULED':
        change.markScheduled();
        break;

      case 'APPLIED':
        change.markApplied();
        break;

      case 'CANCELED':
        change.markCanceled();
        break;

      case 'EXPIRED':
        change.markExpired();
        break;
    }

    change.recordReferences(remote);

    const state = change.snapshot();

    if (state.status === 'APPLIED' && state.mode === 'PERIOD_END') {
      await this.planChangeGateway.releaseSchedule(state);
    }

    await this.billingRepository.saveSnapshot({
      organizationId: state.organizationId,
      snapshot: await this.billingGateway.snapshot(state.stripeCustomerId, state.stripeInvoiceId ?? undefined),
    });

    await this.planChangeRepository.save(change);
    await this.planChangeRepository.postpone(state.id, 60);

    return change.toPublic(remote.clientSecret);
  }
}

import { PlanChange } from '../../domain/entities/planChange.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { PlanChangeGateway, RemotePlanChangeState } from '../ports/planChangeGateway.port.js';
import type { PlanChangeActionParams } from '../types/changePlan.types.js';

export class PlanChangeProcessor {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly billingGateway: BillingGateway,
    private readonly planChangeGateway: PlanChangeGateway,
  ) {}

  async ownedChange(params: PlanChangeActionParams): Promise<PlanChange> {
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

  async execute(change: PlanChange) {
    return this.saveRemote(change, await this.planChangeGateway.execute(change.snapshot()));
  }

  async refresh(change: PlanChange) {
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

  async saveRemote(change: PlanChange, remote: RemotePlanChangeState) {
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

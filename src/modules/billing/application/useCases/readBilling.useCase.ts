import { Subscription } from '../../domain/entities/subscription.entity.js';
import type { BillingRepository, InvoicePageParams } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';

export interface ReadSubscriptionParams {
  organizationId: string;
  userId: string;
}

export class ReadBillingUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly planChangeRepository: PlanChangeRepository,
  ) {}

  async subscription(params: ReadSubscriptionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertMember(organizationId, userId);

    const state = await this.billingRepository.currentSubscription(organizationId);

    return state === null ? null : Subscription.restore(state).toPublic(new Date());
  }

  async entitlements(params: ReadSubscriptionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertMember(organizationId, userId);

    const state = await this.billingRepository.currentSubscription(organizationId);

    const limits = await this.billingRepository.entitlements(organizationId, userId);

    const hasAccess = state !== null && Subscription.restore(state).hasAccessAt(new Date());

    const maxUsers = limits?.maxUsers ?? 0;
    const memberCount = limits?.memberCount ?? 0;
    const teamManagementEnabled = limits?.teamManagementEnabled ?? false;

    const pending = await this.planChangeRepository.active(organizationId);

    const memberLimit = Math.min(maxUsers, pending?.targetMaxUsers ?? maxUsers);

    return {
      hasAccess,
      maxUsers,
      memberCount,
      teamManagementEnabled,
      canAddMember: hasAccess && limits.isOwner && teamManagementEnabled && memberCount < memberLimit,
    };
  }

  async invoices({ userId, ...params }: InvoicePageParams & { userId: string }) {
    await this.billingRepository.assertOwner(params.organizationId, userId);

    return this.billingRepository.invoices(params);
  }
}

import type { OrganizationPlatformAccessReader } from '../../../organizations/application/ports/organizationPlatformAccessReader.port.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { ReadSubscriptionParams } from '../types/billing.types.js';

export class GetEntitlementsUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly platformAccessReader: OrganizationPlatformAccessReader,
  ) {}

  async execute(params: ReadSubscriptionParams) {
    const { organizationId, userId } = params;

    const access = await this.platformAccessReader.read({
      organizationId,
      userId,
    });

    if (!access.isMember) {
      throw new BillingError('ORGANIZATION_NOT_FOUND');
    }

    if (access.billingNeedsReconciliation) {
      throw new BillingError('MULTIPLE_SUBSCRIPTIONS');
    }

    const limits = await this.billingRepository.entitlements(organizationId, userId);

    const hasAccess = access.verified && access.hasPlatformAccess;

    if (access.source === 'TRIAL') {
      return {
        hasAccess,
        maxUsers: 1,
        memberCount: limits.memberCount,
        teamManagementEnabled: false,
        canAddMember: false,
      };
    }

    const maxUsers = limits.maxUsers;
    const memberCount = limits.memberCount;
    const teamManagementEnabled = limits.teamManagementEnabled;

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
}

import { OrganizationRole } from '../../../../generated/prisma/enums.js';
import { OrganizationTeamError } from '../errors/organizationTeam.error.js';

export interface OrganizationTeamContext {
  ownerId: string;
  actorId: string;
  actorRole: OrganizationRole | null;
  actorDisabled: boolean;
  actorEmailVerified: boolean;
}

export interface OrganizationTeamLimits {
  hasAccess: boolean;
  teamManagementEnabled: boolean;
  memberLimit: number;
}

export class OrganizationTeamPolicy {
  private readonly context: OrganizationTeamContext;

  constructor(context: OrganizationTeamContext) {
    this.context = { ...context };
  }

  assertVerifiedActor(): void {
    if (this.context.actorDisabled || !this.context.actorEmailVerified) {
      throw new OrganizationTeamError('VERIFIED_USER_REQUIRED');
    }
  }

  assertOwner(): void {
    if (this.context.ownerId !== this.context.actorId || this.context.actorRole !== OrganizationRole.OWNER) {
      throw new OrganizationTeamError('OWNER_REQUIRED');
    }
  }

  assertMember(): void {
    if (this.context.actorRole === null) {
      throw new OrganizationTeamError('MEMBER_REQUIRED');
    }
  }

  assertCanRemove(userId: string, role: OrganizationRole): void {
    this.assertOwner();

    if (userId === this.context.ownerId || role === OrganizationRole.OWNER) {
      throw new OrganizationTeamError('OWNER_REMOVAL_FORBIDDEN');
    }
  }

  assertCanAdd(access: OrganizationTeamLimits, count: number): void {
    if (!access.hasAccess) {
      throw new OrganizationTeamError('SUBSCRIPTION_REQUIRED');
    }

    if (!access.teamManagementEnabled) {
      throw new OrganizationTeamError('TEAM_MANAGEMENT_REQUIRED');
    }

    if (count >= access.memberLimit) {
      throw new OrganizationTeamError('MEMBER_LIMIT_REACHED');
    }
  }
}

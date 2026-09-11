import type { OrganizationRole } from '../../../../generated/prisma/enums.js';
import type { OrganizationInvitationRepository } from '../../domain/repositories/organizationInvitation.repository.js';
import type { OrganizationMemberRepository } from '../../domain/repositories/organizationMember.repository.js';

import type { OrganizationInvitationRateLimit } from './organizationInvitationRateLimit.port.js';
import type { OrganizationTeamAccess } from './organizationTeamAccess.port.js';

export interface OrganizationActorParams {
  organizationId: string;
  userId: string;
}

export interface OrganizationTransaction {
  readonly organization: {
    id: string;
    name: string;
    ownerId: string;
  };
  readonly actor: {
    id: string;
    email: string;
    disabled: boolean;
    emailVerified: boolean;
  };
  readonly actorRole: OrganizationRole | null;
  readonly members: OrganizationMemberRepository;
  readonly invitations: OrganizationInvitationRepository;
  readonly access: OrganizationTeamAccess;
  readonly invitationRateLimit: OrganizationInvitationRateLimit;
}

export abstract class OrganizationUnitOfWork {
  abstract run<T>(params: OrganizationActorParams, operation: (tx: OrganizationTransaction) => Promise<T>): Promise<T>;
}

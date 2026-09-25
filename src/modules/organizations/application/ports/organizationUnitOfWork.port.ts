import type { OrganizationRole } from '../../../../generated/prisma/enums.js';
import type { NotificationOutbox } from '../../../notifications/application/ports/notificationOutbox.port.js';
import type { InAppNotificationRepository } from '../../../notifications/domain/repositories/inAppNotification.repository.js';
import type { OrganizationProps } from '../../domain/entities/organization.entity.js';
import type { OrganizationInvitationRepository } from '../../domain/repositories/organizationInvitation.repository.js';
import type { OrganizationMemberRepository } from '../../domain/repositories/organizationMember.repository.js';

import type { OrganizationInvitationRateLimit } from './organizationInvitationRateLimit.port.js';
import type { OrganizationTeamAccess } from './organizationTeamAccess.port.js';

export interface OrganizationActorParams {
  organizationId: string;
  userId: string;
}

export interface OrganizationTransaction {
  readonly organization: OrganizationProps;
  readonly actor: {
    id: string;
    name: string;
    email: string;
    disabled: boolean;
    emailVerified: boolean;
  };
  readonly actorRole: OrganizationRole | null;
  readonly members: OrganizationMemberRepository;
  readonly invitations: OrganizationInvitationRepository;
  readonly access: OrganizationTeamAccess;
  readonly invitationRateLimit: OrganizationInvitationRateLimit;
  readonly notifications: NotificationOutbox;
  readonly inAppNotifications: Pick<InAppNotificationRepository, 'enqueue'>;
  readonly saveOrganization: (organization: OrganizationProps) => Promise<void>;
}

export interface OrganizationReadContext {
  readonly organization: OrganizationProps;
  readonly actor: OrganizationTransaction['actor'];
  readonly actorRole: OrganizationTransaction['actorRole'];
  readonly members: Pick<OrganizationMemberRepository, 'list'>;
  readonly invitations: Pick<OrganizationInvitationRepository, 'list'>;
}

export abstract class OrganizationUnitOfWork {
  abstract read<T>(
    params: OrganizationActorParams,
    operation: (context: OrganizationReadContext) => Promise<T>,
  ): Promise<T>;
  abstract run<T>(params: OrganizationActorParams, operation: (tx: OrganizationTransaction) => Promise<T>): Promise<T>;
}

import { OrganizationInvitationStatus } from '../../../../generated/prisma/enums.js';
import { OrganizationInvitation } from '../../domain/entities/organizationInvitation.entity.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';
import { OrganizationTeamPolicy } from '../../domain/policies/organizationTeam.policy.js';
import type { OrganizationInvitationRepository } from '../../domain/repositories/organizationInvitation.repository.js';
import type {
  OrganizationActorParams,
  OrganizationReadContext,
  OrganizationTransaction,
  OrganizationUnitOfWork,
} from '../ports/organizationUnitOfWork.port.js';

export class OrganizationTeamApplicationService {
  constructor(
    private readonly invitationRepository: OrganizationInvitationRepository,
    private readonly unitOfWork: OrganizationUnitOfWork,
  ) {}

  readTeam<T>(
    params: OrganizationActorParams,
    operation: (context: OrganizationReadContext, policy: OrganizationTeamPolicy) => Promise<T>,
  ): Promise<T> {
    return this.unitOfWork.read(params, (context) => operation(context, this.createPolicy(context)));
  }

  withTeam<T>(
    params: OrganizationActorParams,
    operation: (tx: OrganizationTransaction, policy: OrganizationTeamPolicy) => Promise<T>,
  ): Promise<T> {
    return this.unitOfWork.run(params, (tx) => operation(tx, this.createPolicy(tx)));
  }

  async assertCanInvite(
    tx: OrganizationTransaction,
    policy: OrganizationTeamPolicy,
    email: string,
    now: Date,
  ): Promise<void> {
    const organizationId = tx.organization.id;

    if (await tx.members.existsByEmail({ organizationId, email })) {
      throw new OrganizationTeamError('ALREADY_MEMBER');
    }

    policy.assertCanAdd(await tx.access.read({ organizationId, now }), await tx.members.count(organizationId));
  }

  async clearExpiredInvitation(
    tx: OrganizationTransaction,
    email: string,
    now: Date,
    exceptId?: string,
  ): Promise<void> {
    const row = await tx.invitations.findPending({
      organizationId: tx.organization.id,
      email,
    });

    if (row === null || row.id === exceptId) {
      return;
    }

    const previous = OrganizationInvitation.restore(row);

    if (previous.statusAt(now) === OrganizationInvitationStatus.PENDING) {
      throw new OrganizationTeamError('INVITATION_ALREADY_PENDING');
    }

    previous.expire(now);

    await tx.invitations.save(previous);
  }

  async find(tx: OrganizationTransaction, invitationId: string): Promise<OrganizationInvitation> {
    const row = await tx.invitations.findById({
      organizationId: tx.organization.id,
      invitationId,
    });

    if (row === null) {
      throw new OrganizationTeamError('INVITATION_NOT_FOUND');
    }

    return OrganizationInvitation.restore(row);
  }

  async locate(hash: string) {
    const locator = await this.invitationRepository.findByTokenHash(hash);

    if (locator === null) {
      throw new OrganizationTeamError('INVITATION_NOT_FOUND');
    }

    return locator;
  }

  private createPolicy(
    context: Pick<OrganizationReadContext, 'organization' | 'actor' | 'actorRole'>,
  ): OrganizationTeamPolicy {
    const policy = new OrganizationTeamPolicy({
      ownerId: context.organization.ownerId,
      actorId: context.actor.id,
      actorRole: context.actorRole,
      actorDisabled: context.actor.disabled,
      actorEmailVerified: context.actor.emailVerified,
    });

    policy.assertVerifiedActor();

    return policy;
  }
}

import { randomUUID } from 'node:crypto';

import { OrganizationInvitationStatus } from '../../../../generated/prisma/enums.js';
import { OrganizationInvitation } from '../../domain/entities/organizationInvitation.entity.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';
import { OrganizationTeamPolicy } from '../../domain/policies/organizationTeam.policy.js';
import type {
  InvitationPageParams,
  OrganizationInvitationRepository,
} from '../../domain/repositories/organizationInvitation.repository.js';
import type { OrganizationMemberRepository } from '../../domain/repositories/organizationMember.repository.js';
import type { OrganizationPageParams } from '../../domain/types/organizationPagination.types.js';
import type {
  OrganizationInvitationMail,
  OrganizationInvitationTokens,
} from '../ports/organizationInvitationSecurity.port.js';
import type {
  OrganizationActorParams,
  OrganizationTransaction,
  OrganizationUnitOfWork,
} from '../ports/organizationUnitOfWork.port.js';

export interface InviteMemberParams extends OrganizationActorParams {
  email: string;
}

export interface InvitationActionParams extends OrganizationActorParams {
  invitationId: string;
}

export interface InvitationTokenParams {
  userId: string;
  token: string;
}

export interface RemoveMemberParams extends OrganizationActorParams {
  memberId: string;
}

export class ManageOrganizationTeamUseCase {
  constructor(
    private readonly memberRepository: OrganizationMemberRepository,
    private readonly invitationRepository: OrganizationInvitationRepository,
    private readonly unitOfWork: OrganizationUnitOfWork,
    private readonly tokens: OrganizationInvitationTokens,
    private readonly mail: OrganizationInvitationMail,
  ) {}

  mine(userId: string, page: OrganizationPageParams) {
    return this.memberRepository.listJoined({
      userId,
      ...page,
    });
  }

  members(params: OrganizationActorParams, page: OrganizationPageParams) {
    return this.withTeam(params, (tx, policy) => {
      policy.assertMember();

      return tx.members.list({
        ...page,
        organizationId: tx.organization.id,
      });
    });
  }

  invitations(params: OrganizationActorParams, page: InvitationPageParams) {
    return this.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const now = new Date();

      const result = await tx.invitations.list({
        ...page,
        organizationId: tx.organization.id,
        now,
      });

      return {
        ...result,
        items: result.items.map((row) => OrganizationInvitation.restore(row).toPublic(now)),
      };
    });
  }

  async invite(params: InviteMemberParams) {
    const token = this.tokens.create();

    const result = await this.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const now = new Date();
      const email = params.email.trim().toLowerCase();

      await this.assertCanInvite(tx, policy, email, now);
      await this.clearExpiredInvitation(tx, email, now);

      await tx.invitationRateLimit.consume({
        organizationId: tx.organization.id,
        now,
      });

      const invitation = OrganizationInvitation.create({
        id: randomUUID(),
        organizationId: tx.organization.id,
        invitedById: tx.actor.id,
        email,
        tokenHash: token.hash,
        now,
      });

      await tx.invitations.create(invitation);

      return {
        invitation: invitation.toPublic(now),
        organizationName: tx.organization.name,
      };
    });

    const emailAccepted = await this.mail.send({
      email: result.invitation.email,
      organizationName: result.organizationName,
      token: token.value,
    });

    return {
      invitation: result.invitation,
      emailAccepted,
    };
  }

  async resend(params: InvitationActionParams) {
    const token = this.tokens.create();

    const result = await this.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const now = new Date();
      const invitation = await this.find(tx, params.invitationId);
      const email = invitation.snapshot().email;

      await this.assertCanInvite(tx, policy, email, now);

      await this.clearExpiredInvitation(tx, email, now, params.invitationId);

      invitation.resend(token.hash, tx.actor.id, now);

      await tx.invitationRateLimit.consume({
        organizationId: tx.organization.id,
        now,
      });

      await tx.invitations.save(invitation);

      return {
        invitation: invitation.toPublic(now),
        organizationName: tx.organization.name,
      };
    });

    const emailAccepted = await this.mail.send({
      email: result.invitation.email,
      organizationName: result.organizationName,
      token: token.value,
    });

    return {
      invitation: result.invitation,
      emailAccepted,
    };
  }

  async revoke(params: InvitationActionParams): Promise<void> {
    await this.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const invitation = await this.find(tx, params.invitationId);

      invitation.revoke(new Date());

      await tx.invitations.save(invitation);
    });
  }

  async preview(params: InvitationTokenParams) {
    const hash = this.tokens.hash(params.token);
    const locator = await this.locate(hash);

    return this.withTeam(
      {
        organizationId: locator.organizationId,
        userId: params.userId,
      },
      async (tx) => {
        const invitation = await this.find(tx, locator.id);

        invitation.assertToken(hash);
        invitation.assertRecipient(tx.actor.email);
        invitation.assertPending(new Date());

        return {
          id: locator.id,
          organization: {
            id: tx.organization.id,
            name: tx.organization.name,
          },
          expiresAt: invitation.snapshot().expiresAt,
        };
      },
    );
  }

  async accept(params: InvitationTokenParams) {
    const hash = this.tokens.hash(params.token);
    const locator = await this.locate(hash);

    return this.withTeam(
      {
        organizationId: locator.organizationId,
        userId: params.userId,
      },
      async (tx, policy) => {
        const invitation = await this.find(tx, locator.id);

        invitation.assertToken(hash);
        invitation.assertRecipient(tx.actor.email);

        const membership = {
          organizationId: tx.organization.id,
          userId: tx.actor.id,
        };

        const member = await tx.members.findByUser(membership);

        if (invitation.wasAcceptedBy(tx.actor.id)) {
          if (member === null) {
            throw new OrganizationTeamError('INVITATION_CLOSED');
          }

          return {
            organizationId: tx.organization.id,
          };
        }

        const now = new Date();

        invitation.assertPending(now);

        if (member !== null) {
          throw new OrganizationTeamError('ALREADY_MEMBER');
        }

        policy.assertCanAdd(
          await tx.access.read({
            organizationId: tx.organization.id,
            now,
          }),
          await tx.members.count(tx.organization.id),
        );

        invitation.accept(tx.actor.id, now);

        await tx.members.add(membership);
        await tx.invitations.save(invitation);

        return {
          organizationId: tx.organization.id,
        };
      },
    );
  }

  async remove(params: RemoveMemberParams): Promise<void> {
    await this.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const lookup = {
        organizationId: tx.organization.id,
        memberId: params.memberId,
      };

      const member = await tx.members.findById(lookup);

      if (member === null) {
        throw new OrganizationTeamError('MEMBER_NOT_FOUND');
      }

      policy.assertCanRemove(member.userId, member.role);

      await tx.invitations.invalidateAcceptedTokens({
        organizationId: tx.organization.id,
        userId: member.userId,
      });

      await tx.members.remove(lookup);
    });
  }

  private withTeam<T>(
    params: OrganizationActorParams,
    operation: (tx: OrganizationTransaction, policy: OrganizationTeamPolicy) => Promise<T>,
  ): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      const policy = new OrganizationTeamPolicy({
        ownerId: tx.organization.ownerId,
        actorId: tx.actor.id,
        actorRole: tx.actorRole,
        actorDisabled: tx.actor.disabled,
        actorEmailVerified: tx.actor.emailVerified,
      });

      policy.assertVerifiedActor();

      return operation(tx, policy);
    });
  }

  private async assertCanInvite(
    tx: OrganizationTransaction,
    policy: OrganizationTeamPolicy,
    email: string,
    now: Date,
  ): Promise<void> {
    const organizationId = tx.organization.id;

    if (await tx.members.existsByEmail({ organizationId, email })) {
      throw new OrganizationTeamError('ALREADY_MEMBER');
    }

    policy.assertCanAdd(
      await tx.access.read({
        organizationId,
        now,
      }),
      await tx.members.count(organizationId),
    );
  }

  private async clearExpiredInvitation(
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

  private async find(tx: OrganizationTransaction, invitationId: string): Promise<OrganizationInvitation> {
    const row = await tx.invitations.findById({
      organizationId: tx.organization.id,
      invitationId,
    });

    if (row === null) {
      throw new OrganizationTeamError('INVITATION_NOT_FOUND');
    }

    return OrganizationInvitation.restore(row);
  }

  private async locate(hash: string) {
    const locator = await this.invitationRepository.findByTokenHash(hash);

    if (locator === null) {
      throw new OrganizationTeamError('INVITATION_NOT_FOUND');
    }

    return locator;
  }
}

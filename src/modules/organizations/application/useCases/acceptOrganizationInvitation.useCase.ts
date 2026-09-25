import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';
import type { OrganizationInvitationTokens } from '../ports/organizationInvitationSecurity.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import type { InvitationTokenParams } from '../types/organization.types.js';

export class AcceptOrganizationInvitationUseCase {
  constructor(
    private readonly tokens: OrganizationInvitationTokens,
    private readonly processor: OrganizationTeamApplicationService,
  ) {}

  async execute(params: InvitationTokenParams) {
    const hash = this.tokens.hash(params.token);
    const locator = await this.processor.locate(hash);

    return this.processor.withTeam(
      {
        organizationId: locator.organizationId,
        userId: params.userId,
      },
      async (tx, policy) => {
        const invitation = await this.processor.find(tx, locator.id);

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

        if (tx.actor.id !== tx.organization.ownerId) {
          const state = invitation.snapshot();

          await tx.inAppNotifications.enqueue({
            key: `organization-member-joined/${state.id}`,
            userId: tx.organization.ownerId,
            organizationId: tx.organization.id,
            type: 'ORGANIZATION_MEMBER_JOINED',
            title: 'Novo membro na equipe',
            message: `${tx.actor.name} entrou na equipe de ${tx.organization.name}.`,
            href: '/settings?tab=team',
          });
        }

        return {
          organizationId: tx.organization.id,
        };
      },
    );
  }
}

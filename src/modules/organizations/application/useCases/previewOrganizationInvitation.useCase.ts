import type { OrganizationInvitationTokens } from '../ports/organizationInvitationSecurity.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import type { InvitationTokenParams } from '../types/organization.types.js';

export class PreviewOrganizationInvitationUseCase {
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
      async (tx) => {
        const invitation = await this.processor.find(tx, locator.id);

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
}

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AcceptOrganizationInvitationUseCase } from '../../../src/modules/organizations/application/useCases/acceptOrganizationInvitation.useCase.js';
import { InviteOrganizationMemberUseCase } from '../../../src/modules/organizations/application/useCases/inviteOrganizationMember.useCase.js';
import { ListJoinedOrganizationsUseCase } from '../../../src/modules/organizations/application/useCases/listJoinedOrganizations.useCase.js';
import { ListOrganizationInvitationsUseCase } from '../../../src/modules/organizations/application/useCases/listOrganizationInvitations.useCase.js';
import { ListOrganizationMembersUseCase } from '../../../src/modules/organizations/application/useCases/listOrganizationMembers.useCase.js';
import { PreviewOrganizationInvitationUseCase } from '../../../src/modules/organizations/application/useCases/previewOrganizationInvitation.useCase.js';
import { RemoveOrganizationMemberUseCase } from '../../../src/modules/organizations/application/useCases/removeOrganizationMember.useCase.js';
import { ResendOrganizationInvitationUseCase } from '../../../src/modules/organizations/application/useCases/resendOrganizationInvitation.useCase.js';
import { RevokeOrganizationInvitationUseCase } from '../../../src/modules/organizations/application/useCases/revokeOrganizationInvitation.useCase.js';
import { OrganizationTeamError } from '../../../src/modules/organizations/domain/errors/organizationTeam.error.js';
import { OrganizationInvitationController } from '../../../src/modules/organizations/presentation/http/controllers/organizationInvitation.controller.js';
import { OrganizationTeamController } from '../../../src/modules/organizations/presentation/http/controllers/organizationTeam.controller.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId;
const actor = { organizationId, userId };
const invitationRoute = '/api/organization-invitations';
const token = 'a'.repeat(43);

describe('organization team HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const mine = vi.fn();
  const members = vi.fn();
  const invitations = vi.fn();
  const invite = vi.fn();
  const resend = vi.fn();
  const revoke = vi.fn();
  const remove = vi.fn();
  const preview = vi.fn();
  const accept = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [OrganizationTeamController, OrganizationInvitationController],
      [
        { provide: ListJoinedOrganizationsUseCase, useValue: { execute: mine } },
        { provide: ListOrganizationMembersUseCase, useValue: { execute: members } },
        { provide: ListOrganizationInvitationsUseCase, useValue: { execute: invitations } },
        { provide: InviteOrganizationMemberUseCase, useValue: { execute: invite } },
        { provide: ResendOrganizationInvitationUseCase, useValue: { execute: resend } },
        { provide: RevokeOrganizationInvitationUseCase, useValue: { execute: revoke } },
        { provide: RemoveOrganizationMemberUseCase, useValue: { execute: remove } },
        { provide: PreviewOrganizationInvitationUseCase, useValue: { execute: preview } },
        { provide: AcceptOrganizationInvitationUseCase, useValue: { execute: accept } },
      ],
    );
  });

  beforeEach(() => {
    for (const mock of [mine, members, invitations, invite, resend, revoke, remove, preview, accept]) {
      mock.mockReset().mockResolvedValue({});
    }
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires authentication for team listings and passes only the authenticated identity', async () => {
    await request(fixture.server)
      .get(route + '/members')
      .expect(401);
    expect(members).not.toHaveBeenCalled();

    await request(fixture.server)
      .get('/api/organizations/mine')
      .set('Authorization', 'Bearer fixture')
      .query({ page: 2, limit: 5 })
      .expect(200);
    await request(fixture.server)
      .get(route + '/members')
      .set('Authorization', 'Bearer fixture')
      .query({ page: 3, limit: 10 })
      .expect(200);

    expect(mine).toHaveBeenCalledWith(userId, expect.objectContaining({ page: 2, limit: 5 }));
    expect(members).toHaveBeenCalledWith(actor, expect.objectContaining({ page: 3, limit: 10 }));
  });

  it('validates invitation pagination and status before forwarding the selected tenant', async () => {
    await request(fixture.server)
      .get(route + '/invitations')
      .set('Authorization', 'Bearer fixture')
      .query({ status: 'UNKNOWN' })
      .expect(400);
    await request(fixture.server)
      .get(route + '/invitations')
      .set('Authorization', 'Bearer fixture')
      .query({ page: 0 })
      .expect(400);

    expect(invitations).not.toHaveBeenCalled();

    await request(fixture.server)
      .get(route + '/invitations')
      .set('Authorization', 'Bearer fixture')
      .query({ status: 'EXPIRED', page: 2, limit: 5 })
      .expect(200);

    expect(invitations).toHaveBeenCalledWith(actor, expect.objectContaining({ status: 'EXPIRED', page: 2, limit: 5 }));
  });

  it('normalizes email and rejects role escalation or injected actor identity', async () => {
    const path = route + '/invitations';

    for (const body of [
      { email: 'invalid' },
      { email: 'member@example.invalid', role: 'OWNER' },
      { email: 'member@example.invalid', userId: itemId },
    ]) {
      await request(fixture.server).post(path).set('Authorization', 'Bearer fixture').send(body).expect(400);
    }

    expect(invite).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(path)
      .set('Authorization', 'Bearer fixture')
      .send({ email: ' MEMBER@example.invalid ' })
      .expect(201);

    expect(invite).toHaveBeenCalledWith({ ...actor, email: 'member@example.invalid' });
  });

  it('scopes resend, revoke and remove operations and rejects malformed IDs', async () => {
    await request(fixture.server)
      .delete(route + '/members/invalid')
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    expect(remove).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route + '/invitations/' + itemId + '/resend')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    await request(fixture.server)
      .delete(route + '/invitations/' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(204);
    await request(fixture.server)
      .delete(route + '/members/' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(204);

    expect(resend).toHaveBeenCalledWith({ ...actor, invitationId: itemId });
    expect(revoke).toHaveBeenCalledWith({ ...actor, invitationId: itemId });
    expect(remove).toHaveBeenCalledWith({ ...actor, memberId: itemId });
  });

  it('resolves invitation recipients exclusively from the authenticated session and token', async () => {
    await request(fixture.server)
      .post(invitationRoute + '/accept')
      .send({ token })
      .expect(401);
    await request(fixture.server)
      .post(invitationRoute + '/preview')
      .set('Authorization', 'Bearer fixture')
      .send({ token: 'invalid' })
      .expect(400);
    await request(fixture.server)
      .post(invitationRoute + '/accept')
      .set('Authorization', 'Bearer fixture')
      .send({ token, organizationId })
      .expect(400);
    expect(preview).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(invitationRoute + '/preview')
      .set('Authorization', 'Bearer fixture')
      .send({ token })
      .expect(200);
    await request(fixture.server)
      .post(invitationRoute + '/accept')
      .set('Authorization', 'Bearer fixture')
      .send({ token })
      .expect(200);
    expect(preview).toHaveBeenCalledWith({ userId, token });
    expect(accept).toHaveBeenCalledWith({ userId, token });
  });

  it.each([
    ['INVITATION_EXPIRED', 410],
    ['INVITATION_EMAIL_MISMATCH', 403],
    ['INVITATION_CLOSED', 409],
    ['INVITATION_NOT_FOUND', 404],
    ['MEMBER_LIMIT_REACHED', 409],
    ['TEAM_BUSY', 503],
  ] as const)('maps invitation acceptance errors: %s', async (code, status) => {
    accept.mockRejectedValueOnce(new OrganizationTeamError(code));

    await request(fixture.server)
      .post(invitationRoute + '/accept')
      .set('Authorization', 'Bearer fixture')
      .send({ token })
      .expect(status);
  });

  it('maps resend throttling and owner removal denial', async () => {
    resend.mockRejectedValueOnce(new OrganizationTeamError('INVITATION_RATE_LIMITED'));
    remove.mockRejectedValueOnce(new OrganizationTeamError('OWNER_REMOVAL_FORBIDDEN'));

    await request(fixture.server)
      .post(route + '/invitations/' + itemId + '/resend')
      .set('Authorization', 'Bearer fixture')
      .expect(429);
    await request(fixture.server)
      .delete(route + '/members/' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(403);
  });
});

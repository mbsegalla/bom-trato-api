import { describe, expect, it, vi } from 'vitest';

import { OrganizationInvitation } from '../../domain/entities/organizationInvitation.entity.js';
import type { OrganizationInvitationRepository } from '../../domain/repositories/organizationInvitation.repository.js';
import type { OrganizationMemberRepository } from '../../domain/repositories/organizationMember.repository.js';
import type { OrganizationTransaction, OrganizationUnitOfWork } from '../ports/organizationUnitOfWork.port.js';
import { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import { AcceptOrganizationInvitationUseCase } from './acceptOrganizationInvitation.useCase.js';
import { InviteOrganizationMemberUseCase } from './inviteOrganizationMember.useCase.js';
import { RemoveOrganizationMemberUseCase } from './removeOrganizationMember.useCase.js';
import { ResendOrganizationInvitationUseCase } from './resendOrganizationInvitation.useCase.js';
import { RevokeOrganizationInvitationUseCase } from './revokeOrganizationInvitation.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };
const input = { ...actor, email: ' MEMBER@example.invalid ' };
const token = { value: 'fixture-token', hash: 'new-hash' };
function fixture(asRecipient = false) {
  const invitation = OrganizationInvitation.create({
    id: 'invitation', organizationId: 'org', invitedById: 'owner',
    email: 'member@example.invalid', tokenHash: 'old-hash', now: new Date(Date.now() - 120000),
  });
  const member = { id: 'membership', userId: 'member', role: 'MEMBER' as const, createdAt: new Date(), user: { name: 'Member' } };
  const invitations = {
    findById: vi.fn<OrganizationInvitationRepository['findById']>().mockResolvedValue(invitation.snapshot()),
    findByTokenHash: vi.fn<OrganizationInvitationRepository['findByTokenHash']>().mockResolvedValue({ id: 'invitation', organizationId: 'org' }),
    findPending: vi.fn<OrganizationInvitationRepository['findPending']>().mockResolvedValue(null),
    create: vi.fn<OrganizationInvitationRepository['create']>().mockResolvedValue(undefined),
    save: vi.fn<OrganizationInvitationRepository['save']>().mockResolvedValue(undefined),
    invalidateAcceptedTokens: vi.fn<OrganizationInvitationRepository['invalidateAcceptedTokens']>().mockResolvedValue(undefined),
  };
  const members = {
    existsByEmail: vi.fn<OrganizationMemberRepository['existsByEmail']>().mockResolvedValue(false),
    findByUser: vi.fn<OrganizationMemberRepository['findByUser']>().mockResolvedValue(null),
    findById: vi.fn<OrganizationMemberRepository['findById']>().mockResolvedValue(member),
    count: vi.fn<OrganizationMemberRepository['count']>().mockResolvedValue(1),
    add: vi.fn<OrganizationMemberRepository['add']>().mockResolvedValue(undefined),
    remove: vi.fn<OrganizationMemberRepository['remove']>().mockResolvedValue(undefined),
  };
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn().mockResolvedValue(undefined);
  const consume = vi.fn().mockResolvedValue(undefined);
  const read = vi.fn().mockResolvedValue({ hasAccess: true, memberLimit: 3, teamManagementEnabled: true });
  const currentActor = {
    id: asRecipient ? 'member' : 'owner', name: asRecipient ? 'Member' : 'Owner',
    email: asRecipient ? 'member@example.invalid' : 'owner@example.invalid', disabled: false, emailVerified: true,
  };
  const tx = {
    organization: { id: 'org', name: 'Fixture organization', ownerId: 'owner' },
    actor: currentActor, actorRole: asRecipient ? null : 'OWNER',
    members, invitations, access: { read }, invitationRateLimit: { consume },
    notifications: { enqueue }, inAppNotifications: { enqueue: notify },
  } as unknown as OrganizationTransaction;
  const run = vi.fn(async (_actor: typeof actor, operation: (context: OrganizationTransaction) => Promise<unknown>) => operation(tx));
  const tokens = { create: vi.fn().mockReturnValue(token), hash: vi.fn().mockReturnValue('old-hash') };
  const service = new OrganizationTeamApplicationService(
    invitations as unknown as OrganizationInvitationRepository, { run } as unknown as OrganizationUnitOfWork,
  );
  return { invitation, member, currentActor, invitations, members, enqueue, notify, consume, read, run, tokens, service };
}

describe('organization invitation and membership lifecycle', () => {
  it('allows only the verified owner to invite and stores only a token hash', async () => {
    const f = fixture();
    const result = await new InviteOrganizationMemberUseCase(f.tokens, f.service).execute(input);
    expect(result.invitation).toMatchObject({ organizationId: 'org', email: 'member@example.invalid', status: 'PENDING' });
    expect(result.invitation).not.toHaveProperty('tokenHash');
    expect(f.invitations.create.mock.calls[0]![0].snapshot().tokenHash).toBe(token.hash);
    expect(f.consume).toHaveBeenCalledWith({ organizationId: 'org', now: expect.any(Date) });
    expect(f.enqueue).toHaveBeenCalledWith(expect.objectContaining({ recipient: 'member@example.invalid', content: expect.objectContaining({ type: 'ORGANIZATION_INVITATION', token: token.value }) }));
    const outsider = fixture(true);
    await expect(new InviteOrganizationMemberUseCase(outsider.tokens, outsider.service).execute(input)).rejects.toThrow('OWNER_REQUIRED');
    expect(outsider.invitations.create).not.toHaveBeenCalled();
  });
  it('rejects duplicate membership, capacity limits and existing active invitations before queueing', async () => {
    const f = fixture();
    const useCase = new InviteOrganizationMemberUseCase(f.tokens, f.service);
    f.members.existsByEmail.mockResolvedValueOnce(true);
    await expect(useCase.execute(input)).rejects.toThrow('ALREADY_MEMBER');
    f.members.count.mockResolvedValueOnce(3);
    await expect(useCase.execute(input)).rejects.toThrow('MEMBER_LIMIT_REACHED');
    f.invitations.findPending.mockResolvedValueOnce(f.invitation.snapshot());
    await expect(useCase.execute(input)).rejects.toThrow('INVITATION_ALREADY_PENDING');
    expect(f.consume).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
  it('accepts only the intended recipient in the organization resolved from the token', async () => {
    const f = fixture(true);
    const useCase = new AcceptOrganizationInvitationUseCase(f.tokens, f.service);
    const params = { token: 'fixture-token', userId: 'member' };
    f.currentActor.email = 'other@example.invalid';
    await expect(useCase.execute(params)).rejects.toThrow('INVITATION_EMAIL_MISMATCH');
    expect(f.members.add).not.toHaveBeenCalled();
    f.currentActor.email = 'member@example.invalid';
    expect(await useCase.execute(params)).toEqual({ organizationId: 'org' });
    expect(f.run).toHaveBeenCalledWith({ organizationId: 'org', userId: 'member' }, expect.any(Function));
    expect(f.members.add).toHaveBeenCalledWith({ organizationId: 'org', userId: 'member' });
    expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', organizationId: 'org', type: 'ORGANIZATION_MEMBER_JOINED' }));
    const saved = f.invitations.save.mock.calls[0]![0].snapshot();
    expect(saved).toMatchObject({ status: 'ACCEPTED', acceptedById: 'member' });
    f.invitations.findById.mockResolvedValueOnce(saved);
    f.members.findByUser.mockResolvedValueOnce(f.member);
    await expect(useCase.execute(params)).resolves.toEqual({ organizationId: 'org' });
    expect(f.members.add).toHaveBeenCalledTimes(1);
    expect(f.notify).toHaveBeenCalledTimes(1);
  });
  it('resends with a new hash and rejects revoked invitations', async () => {
    const f = fixture();
    const params = { ...actor, invitationId: 'invitation' };
    await new ResendOrganizationInvitationUseCase(f.tokens, f.service).execute(params);
    const saved = f.invitations.save.mock.calls[0]![0];
    expect(saved.snapshot().tokenHash).toBe(token.hash);
    expect(() => saved.assertToken('old-hash')).toThrow('INVITATION_NOT_FOUND');
    f.invitations.findById.mockResolvedValueOnce(saved.snapshot());
    await new RevokeOrganizationInvitationUseCase(f.service).execute(params);
    const revoked = f.invitations.save.mock.calls[1]![0].snapshot();
    expect(revoked.status).toBe('REVOKED');
    f.invitations.findById.mockResolvedValueOnce(revoked);
    await expect(new ResendOrganizationInvitationUseCase(f.tokens, f.service).execute(params)).rejects.toThrow('INVITATION_CLOSED');
    expect(f.enqueue).toHaveBeenCalledTimes(1);
  });
  it('invalidates accepted invitation tokens before removal and never removes the owner', async () => {
    const f = fixture();
    const useCase = new RemoveOrganizationMemberUseCase(f.service);
    f.members.findById.mockResolvedValueOnce({ ...f.member, userId: 'owner', role: 'OWNER' });
    await expect(useCase.execute({ ...actor, memberId: 'membership' })).rejects.toThrow('OWNER_REMOVAL_FORBIDDEN');
    expect(f.members.remove).not.toHaveBeenCalled();
    await useCase.execute({ ...actor, memberId: 'membership' });
    expect(f.invitations.invalidateAcceptedTokens).toHaveBeenCalledWith({ organizationId: 'org', userId: 'member' });
    expect(f.members.remove).toHaveBeenCalledWith({ organizationId: 'org', memberId: 'membership' });
    expect(f.invitations.invalidateAcceptedTokens.mock.invocationCallOrder[0]).toBeLessThan(f.members.remove.mock.invocationCallOrder[0]!);
  });
});

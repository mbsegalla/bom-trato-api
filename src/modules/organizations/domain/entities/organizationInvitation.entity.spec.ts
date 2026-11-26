import { describe, expect, it } from 'vitest';

import { OrganizationInvitation } from './organizationInvitation.entity.js';

const now = new Date('2026-01-01T00:00:00Z');

function fixture() {
  return OrganizationInvitation.create({
    id: 'invitation',
    organizationId: 'org',
    email: ' MEMBER@example.com ',
    invitedById: 'owner',
    tokenHash: 'original-hash',
    now,
  });
}

describe('OrganizationInvitation', () => {
  it('binds the invitation to its normalized recipient and expires at the deadline', () => {
    const invitation = fixture();

    expect(invitation.snapshot().email).toBe('member@example.com');
    expect(() => invitation.assertRecipient('other@example.com')).toThrow('INVITATION_EMAIL_MISMATCH');
    expect(() => invitation.assertToken('other-hash')).toThrow('INVITATION_NOT_FOUND');
    expect(invitation.statusAt(new Date(now.getTime() + 48 * 3600000 - 1))).toBe('PENDING');
    expect(invitation.statusAt(new Date(now.getTime() + 48 * 3600000))).toBe('EXPIRED');
  });

  it('rate limits resends and invalidates the previous token', () => {
    const invitation = fixture();

    expect(() => invitation.resend('new-hash', 'owner', new Date(now.getTime() + 59999))).toThrow(
      'INVITATION_RATE_LIMITED',
    );

    invitation.resend('new-hash', 'owner', new Date(now.getTime() + 60000));

    expect(() => invitation.assertToken('original-hash')).toThrow('INVITATION_NOT_FOUND');
    expect(() => invitation.assertToken('new-hash')).not.toThrow();
  });

  it('prevents reusing accepted invitations and does not expose token hashes', () => {
    const invitation = fixture();
    invitation.accept('member', now);

    expect(invitation.wasAcceptedBy('member')).toBe(true);
    expect(invitation.wasAcceptedBy('other')).toBe(false);
    expect(() => invitation.accept('other', now)).toThrow('INVITATION_CLOSED');
    expect(() => invitation.revoke(now)).toThrow('INVITATION_CLOSED');
    expect(invitation.toPublic(now)).not.toHaveProperty('tokenHash');
  });
});

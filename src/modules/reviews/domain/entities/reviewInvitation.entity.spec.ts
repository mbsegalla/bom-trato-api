import { describe, expect, it } from 'vitest';

import { ReviewInvitation } from './reviewInvitation.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const expiresAt = new Date(now.getTime() + 1000);
const input = { id: 'invite', publicBusinessProfileId: 'profile', workOrderId: 'order', tokenHash: 'hash', createdById: 'owner', now, expiresAt };

describe('ReviewInvitation', () => {
  it('allows only unused, non-revoked invitations before expiration', () => {
    const invitation = ReviewInvitation.create(input);
    expect(() => invitation.assertUsable(now)).not.toThrow();
    expect(() => invitation.assertUsable(expiresAt)).toThrow('REVIEW_INVITATION_EXPIRED');
    const props = invitation.snapshot();
    expect(() => ReviewInvitation.restore({ ...props, usedAt: now }).assertUsable(now)).toThrow('REVIEW_ALREADY_SUBMITTED');
    expect(() => ReviewInvitation.restore({ ...props, revokedAt: now }).assertUsable(now)).toThrow('REVIEW_INVITATION_NOT_FOUND');
  });
});

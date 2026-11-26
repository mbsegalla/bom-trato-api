import { describe, expect, it } from 'vitest';

import { UserAccessPolicy } from './userAccess.policy.js';

describe('UserAccessPolicy', () => {
  it('requires both an enabled and verified account', () => {
    const verified = new Date('2026-01-01T00:00:00Z');
    expect(() => UserAccessPolicy.assertCanAuthenticate({ disabledAt: null, emailVerifiedAt: verified })).not.toThrow();
    expect(() => UserAccessPolicy.assertCanAuthenticate({ disabledAt: null, emailVerifiedAt: null })).toThrow('EMAIL_NOT_VERIFIED');
    expect(() => UserAccessPolicy.assertCanAuthenticate({ disabledAt: verified, emailVerifiedAt: verified })).toThrow('INVALID_CREDENTIALS');
    expect(() => UserAccessPolicy.assertCanAuthenticate({ disabledAt: verified, emailVerifiedAt: null })).toThrow('INVALID_CREDENTIALS');
  });
});

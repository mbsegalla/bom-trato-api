import { describe, expect, it } from 'vitest';

import { AuthIdentity } from './authIdentity.entity.js';

describe('AuthIdentity', () => {
  it('normalizes and binds the provider subject to an exact user', () => {
    const identity = AuthIdentity.google({ id: 'identity', userId: 'user', providerAccountId: ' subject ' });

    expect(identity.snapshot()).toEqual({
      id: 'identity',
      userId: 'user',
      provider: 'GOOGLE',
      providerAccountId: 'subject'
    });

    identity.snapshot().userId = 'other';

    expect(identity.snapshot().userId).toBe('user');
  });

  it.each([
    { id: '' },
    { userId: '' },
    { providerAccountId: ' ' },
    { providerAccountId: 'a'.repeat(256) }
  ])('rejects invalid identity %j', (patch) => {
    expect(() => AuthIdentity.google({
      id: 'identity',
      userId: 'user',
      providerAccountId: 'subject',
      ...patch
    })).toThrow('INVALID_GOOGLE_CREDENTIAL');
  });
});

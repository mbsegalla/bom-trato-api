import { describe, expect, it } from 'vitest';

import { AuthSessionPolicy } from './authSession.policy.js';

describe('AuthSessionPolicy', () => {
  it.each([0, 1, 9])('retains all %i existing sessions below the limit', (count) => {
    expect(AuthSessionPolicy.sessionsToRevoke(Array.from({ length: count }, (_, i) => ({ id: String(i) })))).toEqual(
      [],
    );
  });

  it('revokes only the oldest excess sessions to make room for a new login', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));

    expect(AuthSessionPolicy.sessionsToRevoke(sessions)).toEqual(['0', '1', '2']);
    expect(sessions).toHaveLength(12);
  });
});

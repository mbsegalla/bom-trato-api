import { describe, expect, it, vi } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';

import { ListSessionsUseCase } from './listSessions.useCase.js';
import { LogoutAllUseCase } from './logoutAll.useCase.js';
import { RevokeSessionUseCase } from './revokeSession.useCase.js';

describe('session management use cases', () => {
  it('scopes revocation to the authenticated user and exact requested session', async () => {
    const revoke = vi.fn<AuthRepository['revoke']>().mockResolvedValue(undefined);

    await new RevokeSessionUseCase({ revoke } as unknown as AuthRepository).execute('user', 'session');

    expect(revoke).toHaveBeenCalledWith({
      identity: {
        userId: 'user',
        sessionId: 'session',
      },
      reason: 'SESSION_REVOKED',
      now: asymmetric.any(Date),
    });
  });

  it('revokes all sessions only for the authenticated user', async () => {
    const revokeAll = vi.fn<AuthRepository['revokeAll']>().mockResolvedValue(undefined);

    await new LogoutAllUseCase({ revokeAll } as unknown as AuthRepository).execute('user');

    expect(revokeAll).toHaveBeenCalledWith('user', asymmetric.any(Date));
  });

  it('marks exactly the current session in the scoped list and preserves session metadata', async () => {
    const row = {
      id: 'first',
      createdAt: new Date(),
      lastRefreshedAt: new Date(),
      absoluteExpiresAt: new Date(),
      userAgent: null,
    };
    const listSessions = vi.fn<AuthRepository['listSessions']>().mockResolvedValue([row, { ...row, id: 'second' }]);

    const result = await new ListSessionsUseCase({ listSessions } as unknown as AuthRepository).execute(
      'user',
      'second',
    );

    expect(listSessions).toHaveBeenCalledWith('user', asymmetric.any(Date));
    expect(result).toEqual([
      { ...row, current: false },
      { ...row, id: 'second', current: true },
    ]);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';

import { LogoutUseCase } from './logout.useCase.js';

describe('LogoutUseCase', () => {
  it('ignores malformed refresh tokens without accessing persistence', async () => {
    const revokeByToken = vi.fn<AuthRepository['revokeByToken']>();
    const hashToken = vi.fn();
    const useCase = new LogoutUseCase(
      { revokeByToken } as unknown as AuthRepository,
      { hashToken } as unknown as AuthSecurity,
    );
    for (const refreshToken of ['', 'a'.repeat(42), '/' + 'a'.repeat(42)]) {
      await useCase.execute({ refreshToken, reason: 'LOGOUT' });
    }
    expect(hashToken).not.toHaveBeenCalled();

    expect(revokeByToken).not.toHaveBeenCalled();
  });

  it('revokes only the hashed token using the requested revocation reason', async () => {
    const revokeByToken = vi.fn<AuthRepository['revokeByToken']>().mockResolvedValue(undefined);
    const hashToken = vi.fn().mockReturnValue('hash');
    const useCase = new LogoutUseCase(
      { revokeByToken } as unknown as AuthRepository,
      { hashToken } as unknown as AuthSecurity,
    );

    await useCase.execute({ refreshToken: 'a'.repeat(43), reason: 'LOGOUT' });

    expect(revokeByToken).toHaveBeenCalledWith({ tokenHash: 'hash', reason: 'LOGOUT', now: asymmetric.any(Date) });
  });
});

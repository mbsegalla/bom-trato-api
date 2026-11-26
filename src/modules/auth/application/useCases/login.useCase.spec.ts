import { describe, expect, it, vi } from 'vitest';

import { User } from '../../../users/domain/entities/user.entity.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthTransaction, AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';

import { LoginUseCase } from './login.useCase.js';

const input = {
  email: ' USER@example.com ',
  password: 'Secret!password',
  userAgent: 'fixture',
};
const now = new Date('2026-01-01T00:00:00Z');
const user = (patch: Partial<Parameters<typeof User.restore>[0]> = {}) =>
  User.restore({
    id: 'user',
    name: 'Fixture',
    email: 'user@example.com',
    passwordHash: 'hash',
    selectedPlanPriceId: null,
    emailVerifiedAt: now,
    disabledAt: null,
    ...patch,
  });

function fixture() {
  const repository = {
    findUserByEmail: vi.fn<AuthRepository['findUserByEmail']>().mockResolvedValue(user()),
    startSession: vi.fn<AuthRepository['startSession']>().mockResolvedValue(undefined),
    revokeByToken: vi.fn<AuthRepository['revokeByToken']>().mockResolvedValue(undefined),
  };
  const security = {
    dummyVerify: vi.fn<AuthSecurity['dummyVerify']>().mockResolvedValue(undefined),
    verifyPassword: vi.fn<AuthSecurity['verifyPassword']>().mockResolvedValue(true),
    newId: vi.fn().mockReturnValue('session'),
    newToken: vi.fn().mockReturnValue('a'.repeat(43)),
    hashToken: vi.fn((token: string) => 'hashed:' + token),
    signAccess: vi.fn<AuthSecurity['signAccess']>().mockResolvedValue('access'),
  };
  const run = vi.fn(async (operation: (tx: AuthTransaction) => Promise<unknown>) =>
    operation({ auth: repository } as unknown as AuthTransaction),
  );
  const useCase = new LoginUseCase(
    repository as unknown as AuthRepository,
    security as unknown as AuthSecurity,
    {
      accessTtlSeconds: 900,
      idleTtlSeconds: 3600,
      absoluteTtlSeconds: 86400,
      verificationTtlSeconds: 86400,
      resetTtlSeconds: 1800,
    },
    { run } as unknown as AuthUnitOfWork,
  );

  return { useCase, repository, security, run };
}

describe('LoginUseCase', () => {
  it('normalizes email, replaces the previous session and persists hashed refresh credentials', async () => {
    const f = fixture();
    const previous = 'b'.repeat(43);

    const result = await f.useCase.execute({ ...input, previousRefreshToken: previous });

    expect(f.repository.findUserByEmail).toHaveBeenCalledWith('user@example.com');
    expect(f.repository.revokeByToken).toHaveBeenCalledWith({
      tokenHash: 'hashed:' + previous,
      reason: 'SESSION_REPLACED',
      now: expect.any(Date),
    });
    expect(f.repository.startSession).toHaveBeenCalledWith({
      session: expect.objectContaining({ id: 'session', userId: 'user', userAgent: 'fixture' }),
      expectedPasswordHash: 'hash',
      refreshHash: 'hashed:' + result.refreshToken,
    });
    expect(f.security.signAccess).toHaveBeenCalledWith({ sub: 'user', sid: 'session' });
    expect(result).toMatchObject({ accessToken: 'access', expiresIn: 900 });
  });

  it.each([null, user({ passwordHash: null })])(
    'does dummy verification for missing password accounts without opening a session',
    async (account) => {
      const f = fixture();
      f.repository.findUserByEmail.mockResolvedValue(account);

      await expect(f.useCase.execute(input)).rejects.toThrow('INVALID_CREDENTIALS');
      expect(f.security.dummyVerify).toHaveBeenCalledWith(input.password);
      expect(f.run).not.toHaveBeenCalled();
      expect(f.security.signAccess).not.toHaveBeenCalled();
    },
  );

  it('does not start sessions for bad passwords, unverified or disabled accounts', async () => {
    const f = fixture();
    f.security.verifyPassword.mockResolvedValueOnce(false);

    await expect(f.useCase.execute(input)).rejects.toThrow('INVALID_CREDENTIALS');

    f.repository.findUserByEmail.mockResolvedValueOnce(user({ emailVerifiedAt: null }));

    await expect(f.useCase.execute(input)).rejects.toThrow('EMAIL_NOT_VERIFIED');

    f.repository.findUserByEmail.mockResolvedValueOnce(user({ disabledAt: now }));

    await expect(f.useCase.execute(input)).rejects.toThrow('INVALID_CREDENTIALS');
    expect(f.run).not.toHaveBeenCalled();
    expect(f.security.signAccess).not.toHaveBeenCalled();
  });

  it('never signs an access token when session persistence fails', async () => {
    const f = fixture();
    f.repository.startSession.mockRejectedValueOnce(new Error('session write failed'));

    await expect(f.useCase.execute(input)).rejects.toThrow('session write failed');
    expect(f.security.signAccess).not.toHaveBeenCalled();
  });
});

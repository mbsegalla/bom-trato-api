import { describe, expect, it, vi } from 'vitest';

import { User } from '../../../users/domain/entities/user.entity.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthTransaction, AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import { VerifyEmailUseCase } from './verifyEmail.useCase.js';

const policy = {
  accessTtlSeconds: 900,
  idleTtlSeconds: 3600,
  absoluteTtlSeconds: 86400,
  verificationTtlSeconds: 86400,
  resetTtlSeconds: 1800,
};
const user = (patch: Partial<Parameters<typeof User.restore>[0]> = {}) => User.restore({
  id: 'user', name: 'Fixture', email: 'user@example.invalid', passwordHash: 'hash', selectedPlanPriceId: null,
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), disabledAt: null, ...patch,
});
const input = { token: 'a'.repeat(43), userAgent: 'fixture', previousRefreshToken: 'b'.repeat(43) };
function fixture() {
  const auth = {
    consumeAction: vi.fn<AuthRepository['consumeAction']>().mockResolvedValue('user@example.invalid'),
    findUserByEmail: vi.fn<AuthRepository['findUserByEmail']>().mockResolvedValue(user()),
    revokeByToken: vi.fn<AuthRepository['revokeByToken']>().mockResolvedValue(undefined),
    startSession: vi.fn<AuthRepository['startSession']>().mockResolvedValue(undefined),
  };
  const security = {
    newId: vi.fn().mockReturnValue('session'), newToken: vi.fn().mockReturnValue('c'.repeat(43)),
    hashToken: vi.fn((token: string) => 'hash:' + token),
    signAccess: vi.fn<AuthSecurity['signAccess']>().mockResolvedValue('access'),
  };
  const run = vi.fn(async (operation: (tx: AuthTransaction) => Promise<unknown>) =>
    operation({ auth } as unknown as AuthTransaction));
  return { auth, security, run, useCase: new VerifyEmailUseCase(
    { run } as unknown as AuthUnitOfWork, security as unknown as AuthSecurity, policy,
  ) };
}
describe('VerifyEmailUseCase', () => {
  it('consumes only a verification action and creates a session for its verified account', async () => {
    const f = fixture();
    const result = await f.useCase.execute(input);
    expect(f.auth.consumeAction).toHaveBeenCalledWith({ tokenHash: 'hash:' + input.token, purpose: 'VERIFY_EMAIL', now: expect.any(Date) });
    expect(f.auth.revokeByToken).toHaveBeenCalledWith({ tokenHash: 'hash:' + input.previousRefreshToken, now: expect.any(Date), reason: 'SESSION_REPLACED' });
    expect(f.auth.startSession).toHaveBeenCalledWith({
      session: expect.objectContaining({ id: 'session', userId: 'user' }),
      expectedPasswordHash: 'hash', refreshHash: 'hash:' + result.refreshToken,
    });
    expect(f.security.signAccess).toHaveBeenCalledWith({ sub: 'user', sid: 'session' });
    expect(result).toMatchObject({ accessToken: 'access', expiresIn: 900 });
  });
  it.each([null, user({ disabledAt: new Date() }), user({ passwordHash: null }), user({ emailVerifiedAt: null })])(
    'never starts or signs a session for an unavailable identity', async (account) => {
      const f = fixture();
      f.auth.findUserByEmail.mockResolvedValueOnce(account);
      await expect(f.useCase.execute(input)).rejects.toThrow();
      expect(f.auth.startSession).not.toHaveBeenCalled();
      expect(f.security.signAccess).not.toHaveBeenCalled();
    },
  );
  it('does not resolve a user or create a session after token consumption fails', async () => {
    const f = fixture();
    f.auth.consumeAction.mockRejectedValueOnce(new Error('INVALID_TOKEN'));
    await expect(f.useCase.execute(input)).rejects.toThrow('INVALID_TOKEN');
    expect(f.auth.findUserByEmail).not.toHaveBeenCalled();
    expect(f.security.signAccess).not.toHaveBeenCalled();
  });
});

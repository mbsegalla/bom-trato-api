import { describe, expect, it, vi } from 'vitest';

import { CURRENT_PRIVACY_NOTICE_VERSION, CURRENT_TERMS_VERSION } from '../../../legal/domain/legalDocuments.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthTransaction, AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import { RegisterUseCase } from './register.useCase.js';

const policy = {
  accessTtlSeconds: 900,
  idleTtlSeconds: 3600,
  absoluteTtlSeconds: 86400,
  verificationTtlSeconds: 86400,
  resetTtlSeconds: 1800,
};
const input = {
  name: ' Fixture User ',
  email: ' PERSON@example.invalid ',
  password: 'Fixture!password123',
  termsVersion: CURRENT_TERMS_VERSION,
  privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
  ipAddress: null,
  userAgent: 'fixture',
};

function fixture() {
  const register = vi.fn<AuthRepository['register']>().mockResolvedValue(true);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const hashPassword = vi.fn<AuthSecurity['hashPassword']>().mockResolvedValue('password-hash');
  const newToken = vi.fn().mockReturnValue('a'.repeat(43));
  const hashToken = vi.fn().mockReturnValue('token-hash');
  const run = vi.fn(async (operation: (tx: AuthTransaction) => Promise<unknown>) =>
    operation({ auth: { register }, notifications: { enqueue } } as unknown as AuthTransaction));
  const useCase = new RegisterUseCase(
    { run } as unknown as AuthUnitOfWork,
    { hashPassword, newToken, hashToken } as unknown as AuthSecurity, policy,
  );

  return {
    register,
    enqueue,
    hashPassword,
    newToken,
    hashToken,
    run,
    useCase
  };
}

describe('RegisterUseCase', () => {
  it('persists normalized identity, hashed credentials and current legal acceptance before queueing verification', async () => {
    const f = fixture();

    await f.useCase.execute(input);

    expect(f.hashPassword).toHaveBeenCalledWith(input.password);

    const saved = f.register.mock.calls[0]![0];

    expect(saved).toMatchObject({
      name: 'Fixture User',
      email: 'person@example.invalid',
      passwordHash: 'password-hash',
      tokenHash: 'token-hash',
      selectedPlanPriceId: null,
      legalAcceptance: {
        termsVersion: input.termsVersion,
        privacyNoticeVersion: input.privacyNoticeVersion,
        source: 'PASSWORD_REGISTER',
        ipAddress: null,
        userAgent: 'fixture'
      },
    });
    expect(saved.expiresAt.getTime() - saved.legalAcceptance.acceptedAt.getTime()).toBe(86400000);
    expect(f.enqueue).toHaveBeenCalledWith({
      key: 'verify/token-hash',
      recipient: saved.email,
      content: { type: 'VERIFY_EMAIL', token: 'a'.repeat(43) },
      expiresAt: saved.expiresAt,
    });
    expect(f.register.mock.invocationCallOrder[0]).toBeLessThan(f.enqueue.mock.invocationCallOrder[0]!);
  });

  it.each([
    { password: 'weak' },
    { termsVersion: 'outdated' },
    { privacyNoticeVersion: 'outdated' }
  ])(
    'rejects invalid registration before credential generation or persistence: %j', async (patch) => {
      const f = fixture();

      await expect(f.useCase.execute({ ...input, ...patch })).rejects.toThrow();
      expect(f.hashPassword).not.toHaveBeenCalled();
      expect(f.run).not.toHaveBeenCalled();
    },
  );

  it('does not queue verification for a duplicate registration', async () => {
    const f = fixture();
    f.register.mockResolvedValueOnce(false);

    await expect(f.useCase.execute(input)).rejects.toThrow('EMAIL_ALREADY_EXISTS');
    expect(f.enqueue).not.toHaveBeenCalled();
  });
});

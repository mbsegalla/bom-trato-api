import { describe, expect, it, vi } from 'vitest';

import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthTransaction, AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import { RequestPasswordResetUseCase } from '../useCases/requestPasswordReset.useCase.js';
import { ResendVerificationEmailUseCase } from '../useCases/resendVerificationEmail.useCase.js';
import { AuthEmailSender } from './authEmailSender.service.js';

const policy = {
  accessTtlSeconds: 900,
  idleTtlSeconds: 3600,
  absoluteTtlSeconds: 86400,
  verificationTtlSeconds: 86400,
  resetTtlSeconds: 1800,
};
function fixture() {
  const issueAction = vi.fn<AuthRepository['issueAction']>().mockResolvedValue(true);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const security = {
    newToken: vi.fn().mockReturnValue('a'.repeat(43)),
    hashToken: vi.fn().mockReturnValue('token-hash'),
  };
  const run = vi.fn(async (operation: (tx: AuthTransaction) => Promise<unknown>) =>
    operation({ auth: { issueAction }, notifications: { enqueue } } as unknown as AuthTransaction));
  const sender = new AuthEmailSender({ run } as unknown as AuthUnitOfWork, security as unknown as AuthSecurity, policy);

  return { sender, issueAction, enqueue };
}

describe('AuthEmailSender', () => {
  it.each([['RESET_PASSWORD', 1800], ['VERIFY_EMAIL', 86400]] as const)(
    'uses the purpose-specific TTL and only persists the token hash for %s', async (purpose, ttl) => {
      const f = fixture();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-01T00:00:00Z'));
      try {
        const useCase = purpose === 'RESET_PASSWORD'
          ? new RequestPasswordResetUseCase(f.sender)
          : new ResendVerificationEmailUseCase(f.sender);
        await useCase.execute(' USER@example.invalid ');
        const expiresAt = new Date(Date.now() + ttl * 1000);
        expect(f.issueAction).toHaveBeenCalledWith({
          email: 'user@example.invalid',
          purpose,
          tokenHash: 'token-hash',
          expiresAt
        });
        expect(f.enqueue).toHaveBeenCalledWith({
          key: purpose + '/token-hash',
          recipient: 'user@example.invalid',
          content: { type: purpose, token: 'a'.repeat(43) },
          expiresAt,
        });
      } finally {
        clock.mockRestore();
      }
    },
  );

  it('returns without notifying when the repository declines issuance', async () => {
    const f = fixture();
    f.issueAction.mockResolvedValueOnce(false);

    await expect(f.sender.send('unknown@example.invalid', 'RESET_PASSWORD')).resolves.toBeUndefined();
    expect(f.enqueue).not.toHaveBeenCalled();
  });

  it('propagates persistence failure and does not queue an email', async () => {
    const f = fixture();
    f.issueAction.mockRejectedValueOnce(new Error('write failed'));

    await expect(f.sender.send('user@example.invalid', 'VERIFY_EMAIL')).rejects.toThrow('write failed');
    expect(f.enqueue).not.toHaveBeenCalled();
  });
});

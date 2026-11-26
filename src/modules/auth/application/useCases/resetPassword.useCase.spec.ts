import { describe, expect, it, vi } from 'vitest';

import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthTransaction, AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import { ResetPasswordUseCase } from './resetPassword.useCase.js';

function fixture() {
  const consumeAction = vi.fn<AuthRepository['consumeAction']>().mockResolvedValue('user@example.invalid');
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const hashPassword = vi.fn<AuthSecurity['hashPassword']>().mockResolvedValue('password-hash');
  const hashToken = vi.fn().mockReturnValue('token-hash');
  const run = vi.fn(async (operation: (tx: AuthTransaction) => Promise<unknown>) =>
    operation({ auth: { consumeAction }, notifications: { enqueue } } as unknown as AuthTransaction));
  const useCase = new ResetPasswordUseCase({ run } as unknown as AuthUnitOfWork, { hashPassword, hashToken } as unknown as AuthSecurity);

  return {
    useCase,
    consumeAction,
    enqueue,
    hashPassword,
    hashToken,
    run
  };
}

describe('ResetPasswordUseCase', () => {
  it('consumes a reset-purpose token and queues confirmation within the transaction', async () => {
    const f = fixture();

    await f.useCase.execute('fixture-token', 'New!password123');

    expect(f.consumeAction).toHaveBeenCalledWith({
      tokenHash: 'token-hash',
      purpose: 'RESET_PASSWORD',
      now: expect.any(Date),
      passwordHash: 'password-hash',
    });
    expect(f.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      key: 'password-changed/token-hash',
      recipient: 'user@example.invalid',
      content: { type: 'PASSWORD_CHANGED' },
    }));
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it('rejects weak passwords before hashing or persistence', async () => {
    const f = fixture();

    await expect(f.useCase.execute('token', 'weak')).rejects.toThrow('INVALID_PASSWORD');
    expect(f.hashPassword).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  });

  it('does not enqueue confirmation for a rejected or reused token', async () => {
    const f = fixture();
    f.consumeAction.mockRejectedValueOnce(new Error('INVALID_TOKEN'));

    await expect(f.useCase.execute('token', 'New!password123')).rejects.toThrow('INVALID_TOKEN');
    expect(f.enqueue).not.toHaveBeenCalled();
  });
});

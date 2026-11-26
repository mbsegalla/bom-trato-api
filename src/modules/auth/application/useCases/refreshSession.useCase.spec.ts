import { describe, expect, it, vi } from 'vitest';

import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthPolicy } from '../types/auth.types.js';
import { RefreshSessionUseCase } from './refreshSession.useCase.js';

function fixture() {
  const token = 'a'.repeat(43);
  const nextToken = 'b'.repeat(43);
  const expiresAt = new Date('2030-01-01T00:00:00Z');
  const rotate = vi.fn<AuthRepository['rotate']>().mockResolvedValue({
    identity: { userId: 'user', sessionId: 'session' },
    expiresAt,
  });
  const newToken = vi.fn().mockReturnValue(nextToken);
  const hashToken = vi.fn((value: string) => 'hash:' + value);
  const signAccess = vi.fn<AuthSecurity['signAccess']>().mockResolvedValue('signed-access');
  const policy: AuthPolicy = {
    accessTtlSeconds: 900, idleTtlSeconds: 3600, absoluteTtlSeconds: 86400,
    verificationTtlSeconds: 86400, resetTtlSeconds: 1800,
  };
  return {
    token, nextToken, expiresAt, rotate, newToken, hashToken, signAccess,
    useCase: new RefreshSessionUseCase(
      { rotate } as unknown as AuthRepository,
      { newToken, hashToken, signAccess } as unknown as AuthSecurity,
      policy,
    ),
  };
}

describe('RefreshSessionUseCase', () => {
  it('rotates only hashed credentials and signs the persisted session identity', async () => {
    const f = fixture();
    const result = await f.useCase.execute(f.token);
    expect(f.rotate).toHaveBeenCalledWith({
      tokenHash: 'hash:' + f.token, nextHash: 'hash:' + f.nextToken,
      now: expect.any(Date), idleSeconds: 3600,
    });
    expect(f.signAccess).toHaveBeenCalledWith({ sub: 'user', sid: 'session' });
    expect(result).toMatchObject({
      accessToken: 'signed-access', expiresIn: 900,
      refreshToken: f.nextToken, refreshExpiresAt: f.expiresAt,
    });
  });

  it('rejects malformed tokens before accessing persistence or signing', async () => {
    const f = fixture();
    await expect(f.useCase.execute('invalid')).rejects.toThrow();
    expect(f.newToken).not.toHaveBeenCalled();
    expect(f.rotate).not.toHaveBeenCalled();
    expect(f.signAccess).not.toHaveBeenCalled();
  });

  it('does not issue access credentials after a failed rotation', async () => {
    const f = fixture();
    f.rotate.mockRejectedValueOnce(new Error('rotation rejected'));
    await expect(f.useCase.execute(f.token)).rejects.toThrow('rotation rejected');
    expect(f.signAccess).not.toHaveBeenCalled();
  });
});

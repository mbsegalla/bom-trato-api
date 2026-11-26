import { describe, expect, it } from 'vitest';

import { AuthActionToken } from './authActionToken.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const expiresAt = new Date(now.getTime() + 1000);
const token = () => new AuthActionToken('id', 'user', 'VERIFY_EMAIL', expiresAt, null);

describe('AuthActionToken', () => {
  it('rejects use for another purpose without consuming the token', () => {
    const value = token();
    expect(() => value.consume('RESET_PASSWORD', now)).toThrow('INVALID_TOKEN');
    expect(() => value.consume('VERIFY_EMAIL', now)).not.toThrow();
  });

  it('rejects replay and expiry at the boundary', () => {
    const value = token();
    value.consume('VERIFY_EMAIL', now);
    expect(() => value.consume('VERIFY_EMAIL', now)).toThrow('INVALID_TOKEN');
    expect(() => token().consume('VERIFY_EMAIL', expiresAt)).toThrow('INVALID_TOKEN');
  });
});

import { describe, expect, it } from 'vitest';

import { RefreshToken } from './refreshToken.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const expiresAt = new Date(now.getTime() + 1000);

describe('RefreshToken', () => {
  it('can be consumed only once', () => {
    const token = new RefreshToken('token', 'session', expiresAt, null);
    token.consume(now);
    expect(() => token.consume(now)).toThrow('TOKEN_REUSED');
  });

  it('rejects a token at its expiry boundary', () => {
    const token = new RefreshToken('token', 'session', expiresAt, null);
    expect(() => token.consume(expiresAt)).toThrow('INVALID_TOKEN');
  });

  it('detects reuse even when a used token is also expired', () => {
    const token = new RefreshToken('token', 'session', expiresAt, now);
    expect(() => token.consume(expiresAt)).toThrow('TOKEN_REUSED');
  });
});

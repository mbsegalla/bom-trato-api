import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { NodeAuthSecurity } from './nodeAuthSecurity.js';

const config = {
  jwtSecret: 'a'.repeat(64),
  issuer: 'fixture-issuer',
  audience: 'fixture-audience',
  accessTtlSeconds: 60,
} as ConstructorParameters<typeof NodeAuthSecurity>[0];
const claims = { sub: '11111111-1111-4111-8111-111111111111', sid: '22222222-2222-4222-8222-222222222222' };
const security = new NodeAuthSecurity(config);

describe('NodeAuthSecurity', () => {
  it('uses salted Argon2id hashes and safely rejects invalid hashes and passwords', async () => {
    const password = 'Fixture!password123';

    const [first, second] = await Promise.all([security.hashPassword(password), security.hashPassword(password)]);

    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    expect(await security.verifyPassword(first, password)).toBe(true);
    expect(await security.verifyPassword(first, 'wrong')).toBe(false);
    expect(await security.verifyPassword('malformed', password)).toBe(false);
    await expect(security.dummyVerify(password)).resolves.toBeUndefined();
  });

  it('signs and verifies a scoped access token and rejects tampering and malformed UUIDs', async () => {
    const token = await security.signAccess(claims);

    expect(await security.verifyAccess(token)).toEqual(claims);

    const segments = token.split('.');
    segments[2] = (segments[2]!.startsWith('a') ? 'b' : 'a') + segments[2]!.slice(1);

    await expect(security.verifyAccess(segments.join('.'))).rejects.toThrow('INVALID_SESSION');
    await expect(security.verifyAccess(await security.signAccess({ ...claims, sid: 'invalid' }))).rejects.toThrow(
      'INVALID_SESSION',
    );
  });

  it('rejects wrong audience, issuer, expired and missing claims even with a valid signing key', async () => {
    const key = Buffer.from(config.jwtSecret, 'hex');
    const time = Math.floor(Date.now() / 1000);
    for (const patch of [{ iss: 'other' }, { aud: 'other' }, { exp: time - 1 }, { sid: undefined }]) {
      const payload = {
        ...claims,
        iss: config.issuer,
        aud: config.audience,
        iat: time,
        exp: time + 60,
        ...patch,
      };

      const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);

      await expect(security.verifyAccess(token)).rejects.toThrow('INVALID_SESSION');
    }
  });

  it('issues distinct opaque refresh tokens and deterministic hashes', () => {
    const first = security.newToken();
    const second = security.newToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(security.hashToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(security.hashToken(first)).not.toBe(security.hashToken(second));
  });
});

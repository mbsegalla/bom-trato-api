import { OAuth2Client } from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleIdentityVerifier } from './googleIdentity.provider.js';

const payload = { sub: 'fixture-sub', email: 'USER@EXAMPLE.INVALID', email_verified: true, name: ' Fixture User ', hd: ' example.invalid ' };

function fixture(value: unknown = payload) {
  const verify = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
    getPayload: () => value,
  } as unknown as Awaited<ReturnType<OAuth2Client['verifyIdToken']>>);

  return { verifier: new GoogleIdentityVerifier('fixture-client'), verify };
}

describe('GoogleIdentityVerifier', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['', 'x'.repeat(8193)])('rejects invalid credential size without calling Google', async (credential) => {
    const f = fixture();
    await expect(f.verifier.verifyCredential(credential)).rejects.toThrow('INVALID_GOOGLE_CREDENTIAL');
    expect(f.verify).not.toHaveBeenCalled();
  });

  it('verifies audience and normalizes identity attributes', async () => {
    const f = fixture();

    expect(await f.verifier.verifyCredential('fixture-token')).toEqual({
      subject: 'fixture-sub', email: 'user@example.invalid', name: 'Fixture User',
      emailVerified: true, hostedDomain: 'example.invalid',
    });
    expect(f.verify).toHaveBeenCalledWith({ idToken: 'fixture-token', audience: 'fixture-client' });
  });

  it.each([null, {}, { ...payload, sub: '' }, { ...payload, email: '' }, { ...payload, email_verified: 'true' }])(
    'rejects malformed identity payloads', async (value) => {
      await expect(fixture(value).verifier.verifyCredential('token')).rejects.toThrow('INVALID_GOOGLE_CREDENTIAL');
    },
  );

  it.each([
    [{ name: '', given_name: ' Given ' }, 'Given'],
    [{ name: '', given_name: '' }, 'user'],
    [{ name: '', given_name: '', email: 'a@example.invalid' }, 'Conta Google'],
    [{ name: 'a'.repeat(120) }, 'a'.repeat(100)],
  ] as const)('normalizes missing or oversized profile names', async (patch, name) => {
    const f = fixture({ ...payload, ...patch, hd: ' ', email_verified: false });
    expect(await f.verifier.verifyCredential('token')).toMatchObject({ name, hostedDomain: null, emailVerified: false });
  });

  it('translates upstream verification errors into a safe domain error', async () => {
    const f = fixture();
    f.verify.mockRejectedValue(new Error('provider details'));
    await expect(f.verifier.verifyCredential('token')).rejects.toThrow('INVALID_GOOGLE_CREDENTIAL');
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthTransaction, AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import type { GoogleIdentityProvider } from '../ports/googleIdentityProvider.port.js';

import { LinkGoogleIdentityUseCase } from './linkGoogleIdentity.useCase.js';

const profile = {
  subject: 'google-subject',
  name: 'Fixture',
  email: ' USER@example.invalid ',
  emailVerified: true,
  hostedDomain: null,
};
function fixture() {
  const linkIdentity = vi.fn<AuthRepository['linkIdentity']>().mockResolvedValue(undefined);
  const google = { verifyCredential: vi.fn<GoogleIdentityProvider['verifyCredential']>().mockResolvedValue(profile) };
  const run = vi.fn(async (operation: (tx: AuthTransaction) => Promise<unknown>) =>
    operation({ auth: { linkIdentity } } as unknown as AuthTransaction),
  );

  return {
    google,
    linkIdentity,
    run,
    useCase: new LinkGoogleIdentityUseCase(
      { run } as unknown as AuthUnitOfWork,
      { newId: () => 'identity' } as unknown as AuthSecurity,
      google,
    ),
  };
}

describe('LinkGoogleIdentityUseCase', () => {
  const input = {
    userId: 'owner',
    email: 'user@example.invalid',
    credential: 'fixture',
  };

  it('links only the verified provider subject to the authenticated user', async () => {
    const f = fixture();

    await f.useCase.execute(input);

    expect(f.linkIdentity).toHaveBeenCalledWith({
      id: 'identity',
      userId: 'owner',
      provider: 'GOOGLE',
      providerAccountId: 'google-subject',
    });
  });

  it.each([
    [{ emailVerified: false }, 'GOOGLE_EMAIL_NOT_VERIFIED'],
    [{ email: 'other@example.invalid' }, 'GOOGLE_EMAIL_MISMATCH'],
    [{ subject: ' ' }, 'INVALID_GOOGLE_CREDENTIAL'],
  ] as const)('rejects invalid identities before persisting: %j', async (patch, code) => {
    const f = fixture();
    f.google.verifyCredential.mockResolvedValueOnce({ ...profile, ...patch });

    await expect(f.useCase.execute(input)).rejects.toThrow(code);
    expect(f.run).not.toHaveBeenCalled();
  });
});

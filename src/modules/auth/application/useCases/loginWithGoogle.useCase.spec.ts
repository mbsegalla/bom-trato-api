import { describe, expect, it, vi } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import { CURRENT_PRIVACY_NOTICE_VERSION, CURRENT_TERMS_VERSION } from '../../../legal/domain/legalDocuments.js';
import { User } from '../../../users/domain/entities/user.entity.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthTransaction, AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import type { GoogleIdentityProvider } from '../ports/googleIdentityProvider.port.js';

import { LoginWithGoogleUseCase } from './loginWithGoogle.useCase.js';

const policy = {
  accessTtlSeconds: 900,
  idleTtlSeconds: 3600,
  absoluteTtlSeconds: 86400,
  verificationTtlSeconds: 86400,
  resetTtlSeconds: 1800,
};
const profile = {
  subject: 'google-subject',
  email: ' USER@example.invalid ',
  name: 'Fixture',
  emailVerified: true,
  hostedDomain: null,
};
const account = User.restore({
  id: 'user',
  name: 'Fixture',
  email: 'user@example.invalid',
  passwordHash: null,
  selectedPlanPriceId: null,
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  disabledAt: null,
});
const input = { credential: 'fixture', userAgent: null, ipAddress: null };
const legal = { termsVersion: CURRENT_TERMS_VERSION, privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION };
function fixture() {
  const auth = {
    findUserByIdentity: vi.fn<AuthRepository['findUserByIdentity']>().mockResolvedValue(null),
    findUserByEmail: vi.fn<AuthRepository['findUserByEmail']>().mockResolvedValue(null),
    registerFederated: vi.fn<AuthRepository['registerFederated']>().mockResolvedValue(account),
    startFederatedSession: vi.fn<AuthRepository['startFederatedSession']>().mockResolvedValue(undefined),
    revokeByToken: vi.fn<AuthRepository['revokeByToken']>().mockResolvedValue(undefined),
  };
  const security = {
    newId: vi.fn().mockReturnValueOnce('user').mockReturnValueOnce('identity').mockReturnValue('session'),
    newToken: vi.fn().mockReturnValue('a'.repeat(43)),
    hashToken: vi.fn().mockReturnValue('refresh-hash'),
    signAccess: vi.fn<AuthSecurity['signAccess']>().mockResolvedValue('access'),
  };
  const google = { verifyCredential: vi.fn<GoogleIdentityProvider['verifyCredential']>().mockResolvedValue(profile) };
  const run = vi.fn(async (operation: (tx: AuthTransaction) => Promise<unknown>) =>
    operation({ auth } as unknown as AuthTransaction),
  );

  return {
    auth,
    google,
    security,
    run,
    useCase: new LoginWithGoogleUseCase(
      { run } as unknown as AuthUnitOfWork,
      security as unknown as AuthSecurity,
      google,
      policy,
    ),
  };
}

describe('LoginWithGoogleUseCase', () => {
  it('rejects unverified Google email before accessing persistence', async () => {
    const f = fixture();
    f.google.verifyCredential.mockResolvedValueOnce({ ...profile, emailVerified: false });

    await expect(f.useCase.execute(input)).rejects.toThrow('GOOGLE_EMAIL_NOT_VERIFIED');
    expect(f.run).not.toHaveBeenCalled();
  });

  it('never silently links a password account by matching email', async () => {
    const f = fixture();
    f.auth.findUserByEmail.mockResolvedValueOnce(account);

    await expect(f.useCase.execute({ ...input, ...legal })).rejects.toThrow('GOOGLE_ACCOUNT_LINK_REQUIRED');
    expect(f.auth.findUserByEmail).toHaveBeenCalledWith('user@example.invalid');
    expect(f.auth.registerFederated).not.toHaveBeenCalled();
    expect(f.security.signAccess).not.toHaveBeenCalled();
  });

  it('requires current legal acceptance for a new Google account', async () => {
    const f = fixture();

    await expect(f.useCase.execute(input)).rejects.toThrow('TERMS_ACCEPTANCE_REQUIRED');
    await expect(
      f.useCase.execute({
        ...input,
        ...legal,
        termsVersion: 'outdated',
      }),
    ).rejects.toThrow('LEGAL_DOCUMENT_VERSION_OUTDATED');
    expect(f.auth.registerFederated).not.toHaveBeenCalled();
  });

  it('registers the verified subject and opens a federated session without a password', async () => {
    const f = fixture();

    expect(await f.useCase.execute({ ...input, ...legal })).toMatchObject({ accessToken: 'access', expiresIn: 900 });
    expect(f.auth.registerFederated).toHaveBeenCalledWith(
      asymmetric.objectContaining({
        userId: 'user',
        email: 'user@example.invalid',
        identity: {
          id: 'identity',
          userId: 'user',
          provider: 'GOOGLE',
          providerAccountId: profile.subject,
        },
        legalAcceptance: asymmetric.objectContaining({ ...legal, source: 'GOOGLE_REGISTER' }),
      }),
    );
    expect(f.auth.startFederatedSession).toHaveBeenCalledWith({
      session: asymmetric.objectContaining({ id: 'session', userId: 'user' }),
      refreshHash: 'refresh-hash',
    });
  });

  it('logs in an already linked subject without registering or accepting terms again', async () => {
    const f = fixture();
    f.auth.findUserByIdentity.mockResolvedValueOnce(account);

    await f.useCase.execute(input);

    expect(f.auth.findUserByIdentity).toHaveBeenCalledWith('GOOGLE', profile.subject);
    expect(f.auth.findUserByEmail).not.toHaveBeenCalled();
    expect(f.auth.registerFederated).not.toHaveBeenCalled();
    expect(f.auth.startFederatedSession).toHaveBeenCalledTimes(1);
  });
});

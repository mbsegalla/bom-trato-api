import { AuthProvider } from '../../../../generated/prisma/enums.js';
import { normalizeEmail } from '../../../../shared/text/email.js';
import { AuthIdentity } from '../../domain/entities/authIdentity.entity.js';
import { AuthSession } from '../../domain/entities/authSession.entity.js';
import { AuthError } from '../../domain/errors/auth.error.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import type { GoogleIdentityProvider } from '../ports/googleIdentityProvider.port.js';
import type { AuthPolicy, GoogleLoginInput, LoginResult } from '../types/auth.types.js';

export class LoginWithGoogleUseCase {
  constructor(
    private readonly unitOfWork: AuthUnitOfWork,
    private readonly security: AuthSecurity,
    private readonly google: GoogleIdentityProvider,
    private readonly policy: AuthPolicy,
  ) {}

  async execute(input: GoogleLoginInput): Promise<LoginResult> {
    const { credential, userAgent, previousRefreshToken, selectedPlanPriceId } = input;

    const profile = await this.google.verifyCredential(credential);

    if (!profile.emailVerified) {
      throw new AuthError('GOOGLE_EMAIL_NOT_VERIFIED');
    }

    const email = normalizeEmail(profile.email);

    return this.unitOfWork.run(async (tx) => {
      let user = await tx.auth.findUserByIdentity(AuthProvider.GOOGLE, profile.subject);

      if (user === null) {
        const existing = await tx.auth.findUserByEmail(email);

        if (existing !== null) {
          throw new AuthError('GOOGLE_ACCOUNT_LINK_REQUIRED');
        }

        const userId = this.security.newId();

        const identity = AuthIdentity.google({
          id: this.security.newId(),
          userId,
          providerAccountId: profile.subject,
        });

        user = await tx.auth.registerFederated({
          userId,
          name: profile.name,
          email,
          emailVerifiedAt: new Date(),
          selectedPlanPriceId: selectedPlanPriceId ?? null,
          identity: identity.snapshot(),
        });
      }

      user.assertCanAuthenticate();

      const now = new Date();

      if (previousRefreshToken) {
        await tx.auth.revokeByToken({
          tokenHash: this.security.hashToken(previousRefreshToken),
          now,
          reason: 'SESSION_REPLACED',
        });
      }

      const session = AuthSession.start(
        this.security.newId(),
        user.id,
        now,
        this.policy.idleTtlSeconds,
        this.policy.absoluteTtlSeconds,
        userAgent,
      ).snapshot();

      const refreshToken = this.security.newToken();

      await tx.auth.startFederatedSession({
        session,
        refreshHash: this.security.hashToken(refreshToken),
      });

      const accessToken = await this.security.signAccess({
        sub: user.id,
        sid: session.id,
      });

      return {
        accessToken,
        expiresIn: this.policy.accessTtlSeconds,
        refreshToken,
        refreshExpiresAt: session.idleExpiresAt,
      };
    });
  }
}

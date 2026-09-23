import { AuthSession } from '../../domain/entities/authSession.entity.js';
import { AuthError } from '../../domain/errors/auth.error.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import type { AuthPolicy, VerifyEmailInput, VerifyEmailResult } from '../types/auth.types.js';

export class VerifyEmailUseCase {
  constructor(
    private readonly unitOfWork: AuthUnitOfWork,
    private readonly security: AuthSecurity,
    private readonly policy: AuthPolicy,
  ) {}

  execute(input: VerifyEmailInput): Promise<VerifyEmailResult> {
    const { token, userAgent, previousRefreshToken } = input;

    const tokenHash = this.security.hashToken(token);

    return this.unitOfWork.run(async (tx) => {
      const now = new Date();

      const email = await tx.auth.consumeAction({
        tokenHash,
        purpose: 'VERIFY_EMAIL',
        now,
      });

      const user = await tx.auth.findUserByEmail(email);

      if (user === null) {
        throw new AuthError('INVALID_TOKEN');
      }

      user.assertCanAuthenticate();

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

      await tx.auth.startSession({
        session,
        expectedPasswordHash: user.passwordHash,
        refreshHash: this.security.hashToken(refreshToken),
      });

      // Sign before commit so signing failures also roll back token consumption.
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

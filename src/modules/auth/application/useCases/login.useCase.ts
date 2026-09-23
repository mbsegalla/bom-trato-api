import { normalizeEmail } from '../../../../shared/text/email.js';
import { AuthSession } from '../../domain/entities/authSession.entity.js';
import { AuthError } from '../../domain/errors/auth.error.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import type { AuthPolicy, LoginInput, LoginResult } from '../types/auth.types.js';

export class LoginUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly security: AuthSecurity,
    private readonly policy: AuthPolicy,
    private readonly unitOfWork: AuthUnitOfWork,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const { email, password, userAgent } = input;

    const user = await this.authRepository.findUserByEmail(normalizeEmail(email));

    if (user === null) {
      await this.security.dummyVerify(password);
      throw new AuthError('INVALID_CREDENTIALS');
    }

    const validPassword = await this.security.verifyPassword(user.passwordHash, password);

    if (!validPassword) {
      throw new AuthError('INVALID_CREDENTIALS');
    }

    user.assertCanAuthenticate();

    return this.unitOfWork.run(async (tx) => {
      const now = new Date();

      if (input.previousRefreshToken) {
        await tx.auth.revokeByToken({
          tokenHash: this.security.hashToken(input.previousRefreshToken),
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
      );

      const state = session.snapshot();
      const refreshToken = this.security.newToken();

      await tx.auth.startSession({
        session: state,
        expectedPasswordHash: user.passwordHash,
        refreshHash: this.security.hashToken(refreshToken),
      });

      return {
        accessToken: await this.security.signAccess({
          sub: user.id,
          sid: state.id,
        }),
        expiresIn: this.policy.accessTtlSeconds,
        refreshToken,
        refreshExpiresAt: state.idleExpiresAt,
      };
    });
  }
}

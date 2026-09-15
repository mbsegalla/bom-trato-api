import { User } from '../../../users/domain/entities/user.entity.js';
import { AuthSession } from '../../domain/entities/authSession.entity.js';
import { AuthError } from '../../domain/errors/auth.error.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthPolicy } from '../types/authPolicy.types.js';
import type { LoginResult } from '../types/loginResult.types.js';

export interface LoginInput {
  email: string;
  password: string;
  userAgent: string | null;
}

export class LoginUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly security: AuthSecurity,
    private readonly policy: AuthPolicy,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const { email, password, userAgent } = input;

    const user = await this.authRepository.findUserByEmail(User.normalizeEmail(email));

    if (user === null) {
      await this.security.dummyVerify(password);
      throw new AuthError('INVALID_CREDENTIALS');
    }

    const validPassword = await this.security.verifyPassword(user.passwordHash, password);

    if (!validPassword) {
      throw new AuthError('INVALID_CREDENTIALS');
    }

    user.assertCanAuthenticate();

    const session = AuthSession.start(
      this.security.newId(),
      user.id,
      new Date(),
      this.policy.idleTtlSeconds,
      this.policy.absoluteTtlSeconds,
      userAgent,
    );

    const state = session.snapshot();
    const refreshToken = this.security.newToken();

    await this.authRepository.startSession({
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
  }
}

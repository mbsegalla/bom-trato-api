import { AuthError } from '../../domain/errors/auth.error.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthPolicy, LoginResult } from '../ports/authPolicy.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';

export class RefreshSessionUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly security: AuthSecurity,
    private readonly policy: AuthPolicy,
  ) {}

  async execute(token: string): Promise<LoginResult> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new AuthError('INVALID_TOKEN');
    }

    const nextToken = this.security.newToken();

    const result = await this.authRepository.rotate({
      tokenHash: this.security.hashToken(token),
      nextHash: this.security.hashToken(nextToken),
      now: new Date(),
      idleSeconds: this.policy.idleTtlSeconds,
    });

    return {
      accessToken: await this.security.signAccess({
        sub: result.identity.userId,
        sid: result.identity.sessionId,
      }),
      expiresIn: this.policy.accessTtlSeconds,
      refreshToken: nextToken,
      refreshExpiresAt: result.expiresAt,
    };
  }
}

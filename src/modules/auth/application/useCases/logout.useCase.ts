import type { SessionRevocationReason } from '../../../../generated/prisma/enums.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';

export interface LogoutInput {
  refreshToken: string;
  reason: SessionRevocationReason;
}

export class LogoutUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly security: AuthSecurity,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const { refreshToken, reason } = input;

    if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) {
      return;
    }

    await this.repository.revokeByToken({
      tokenHash: this.security.hashToken(refreshToken),
      now: new Date(),
      reason,
    });
  }
}

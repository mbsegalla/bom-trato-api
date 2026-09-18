import { SessionRevocationReason } from '../../../../generated/prisma/enums.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';

export class RevokeSessionUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  execute(userId: string, sessionId: string): Promise<void> {
    return this.authRepository.revoke({
      identity: { userId, sessionId },
      now: new Date(),
      reason: SessionRevocationReason.SESSION_REVOKED,
    });
  }
}

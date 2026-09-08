import { AuthActionPurpose } from '../../../../generated/prisma/enums.js';
import { User } from '../../../users/domain/entities/user.entity.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';

export class ResetPasswordUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly security: AuthSecurity,
  ) {}

  async execute(token: string, password: string): Promise<void> {
    User.assertPassword(password);

    const passwordHash = await this.security.hashPassword(password);

    await this.authRepository.consumeAction({
      tokenHash: this.security.hashToken(token),
      purpose: AuthActionPurpose.RESET_PASSWORD,
      now: new Date(),
      passwordHash,
    });
  }
}

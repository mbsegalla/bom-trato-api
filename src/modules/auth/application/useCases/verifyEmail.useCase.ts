import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';

export class VerifyEmailUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly security: AuthSecurity,
  ) {}

  async execute(token: string): Promise<void> {
    await this.authRepository.consumeAction({
      tokenHash: this.security.hashToken(token),
      purpose: 'VERIFY_EMAIL',
      now: new Date(),
    });
  }
}

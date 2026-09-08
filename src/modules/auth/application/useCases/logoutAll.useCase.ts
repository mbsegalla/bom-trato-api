import type { AuthRepository } from '../../domain/repositories/auth.repository.js';

export class LogoutAllUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  execute(userId: string): Promise<void> {
    return this.authRepository.revokeAll(userId, new Date());
  }
}

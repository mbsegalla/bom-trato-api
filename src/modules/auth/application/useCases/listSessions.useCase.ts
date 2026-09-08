import type { AuthRepository } from '../../domain/repositories/auth.repository.js';

export class ListSessionsUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  async execute(userId: string, currentSessionId: string) {
    const sessions = await this.authRepository.listSessions(userId, new Date());

    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }
}

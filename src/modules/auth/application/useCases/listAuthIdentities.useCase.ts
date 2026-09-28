import type { AuthProvider } from '../../../../generated/prisma/enums.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';

export interface AuthIdentitiesView {
  providers: AuthProvider[];
}

export class ListAuthIdentitiesUseCase {
  constructor(private readonly authRepository: AuthRepository) {}

  async execute(userId: string): Promise<AuthIdentitiesView> {
    return {
      providers: await this.authRepository.listIdentityProviders(userId),
    };
  }
}

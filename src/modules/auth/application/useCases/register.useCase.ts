import { User } from '../../../users/domain/entities/user.entity.js';
import { UserError } from '../../../users/domain/errors/user.error.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthPolicy } from '../ports/authPolicy.js';
import type { AuthMail, AuthSecurity } from '../ports/authSecurity.port.js';

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export class RegisterUseCase {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly security: AuthSecurity,
    private readonly mail: AuthMail,
    private readonly policy: AuthPolicy,
  ) {}

  async execute(input: RegisterUserInput): Promise<void> {
    const { name, email: rawEmail, password } = input;

    User.assertPassword(password);

    const email = User.normalizeEmail(rawEmail);
    const passwordHash = await this.security.hashPassword(password);
    const token = this.security.newToken();

    const created = await this.authRepository.register({
      name: name.trim(),
      email,
      passwordHash,
      tokenHash: this.security.hashToken(token),
      expiresAt: new Date(Date.now() + this.policy.verificationTtlSeconds * 1000),
    });

    if (!created) {
      throw new UserError('EMAIL_ALREADY_EXISTS');
    }

    await this.mail.sendVerification(email, token);
  }
}

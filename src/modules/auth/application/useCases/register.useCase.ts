import { normalizeEmail } from '../../../../shared/text/email.js';
import { User } from '../../../users/domain/entities/user.entity.js';
import { UserError } from '../../../users/domain/errors/user.error.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthMail, AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthPolicy, RegisterUserInput } from '../types/auth.types.js';

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

    const email = normalizeEmail(rawEmail);
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

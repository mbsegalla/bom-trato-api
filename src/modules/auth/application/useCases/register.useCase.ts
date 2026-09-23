import { normalizeEmail } from '../../../../shared/text/email.js';
import { User } from '../../../users/domain/entities/user.entity.js';
import { UserError } from '../../../users/domain/errors/user.error.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import type { AuthPolicy, RegisterUserInput } from '../types/auth.types.js';

export class RegisterUseCase {
  constructor(
    private readonly unitOfWork: AuthUnitOfWork,
    private readonly security: AuthSecurity,
    private readonly policy: AuthPolicy,
  ) {}

  async execute(input: RegisterUserInput): Promise<void> {
    const { name, email: rawEmail, password } = input;

    User.assertPassword(password);

    const email = normalizeEmail(rawEmail);
    const passwordHash = await this.security.hashPassword(password);
    const token = this.security.newToken();
    const tokenHash = this.security.hashToken(token);

    const expiresAt = new Date(Date.now() + this.policy.verificationTtlSeconds * 1000);

    await this.unitOfWork.run(async (tx) => {
      const created = await tx.auth.register({
        name: name.trim(),
        email,
        passwordHash,
        selectedPlanPriceId: input.selectedPlanPriceId ?? null,
        tokenHash,
        expiresAt,
      });

      if (!created) {
        throw new UserError('EMAIL_ALREADY_EXISTS');
      }

      await tx.notifications.enqueue({
        key: `verify/${tokenHash}`,
        recipient: email,
        content: {
          type: 'VERIFY_EMAIL',
          token,
        },
        expiresAt,
      });
    });
  }
}

import { AuthActionPurpose } from '../../../../generated/prisma/enums.js';
import { User } from '../../../users/domain/entities/user.entity.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';

export class ResetPasswordUseCase {
  constructor(
    private readonly unitOfWork: AuthUnitOfWork,
    private readonly security: AuthSecurity,
  ) {}

  async execute(token: string, password: string): Promise<void> {
    User.assertPassword(password);

    const passwordHash = await this.security.hashPassword(password);
    const tokenHash = this.security.hashToken(token);

    await this.unitOfWork.run(async (tx) => {
      const email = await tx.auth.consumeAction({
        tokenHash,
        purpose: AuthActionPurpose.RESET_PASSWORD,
        now: new Date(),
        passwordHash,
      });

      await tx.notifications.enqueue({
        key: `password-changed/${tokenHash}`,
        recipient: email,
        content: {
          type: 'PASSWORD_CHANGED',
        },
        expiresAt: new Date(Date.now() + 86400000),
      });
    });
  }
}

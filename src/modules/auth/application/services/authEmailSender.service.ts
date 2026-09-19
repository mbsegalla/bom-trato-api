import { AuthActionPurpose } from '../../../../generated/prisma/enums.js';
import { normalizeEmail } from '../../../../shared/text/email.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import type { AuthPolicy } from '../types/auth.types.js';

export class AuthEmailSender {
  constructor(
    private readonly unitOfWork: AuthUnitOfWork,
    private readonly security: AuthSecurity,
    private readonly policy: AuthPolicy,
  ) {}

  async send(emailInput: string, purpose: AuthActionPurpose): Promise<void> {
    const email = normalizeEmail(emailInput);
    const token = this.security.newToken();

    const ttl =
      purpose === AuthActionPurpose.VERIFY_EMAIL ? this.policy.verificationTtlSeconds : this.policy.resetTtlSeconds;

    const tokenHash = this.security.hashToken(token);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.unitOfWork.run(async (tx) => {
      const issued = await tx.auth.issueAction({
        email,
        purpose,
        tokenHash,
        expiresAt,
      });

      if (!issued) {
        return;
      }

      await tx.notifications.enqueue({
        key: `${purpose}/${tokenHash}`,
        recipient: email,
        content: {
          type: purpose,
          token,
        },
        expiresAt,
      });
    });
  }
}

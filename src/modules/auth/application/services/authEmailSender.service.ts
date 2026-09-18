import { AuthActionPurpose } from '../../../../generated/prisma/enums.js';
import { normalizeEmail } from '../../../../shared/text/email.js';
import type { AuthRepository } from '../../domain/repositories/auth.repository.js';
import type { AuthMail, AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthPolicy } from '../types/auth.types.js';

export class AuthEmailSender {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly security: AuthSecurity,
    private readonly mail: AuthMail,
    private readonly policy: AuthPolicy,
  ) {}

  async send(emailInput: string, purpose: AuthActionPurpose): Promise<void> {
    const email = normalizeEmail(emailInput);
    const token = this.security.newToken();

    const ttl =
      purpose === AuthActionPurpose.VERIFY_EMAIL ? this.policy.verificationTtlSeconds : this.policy.resetTtlSeconds;

    const issued = await this.authRepository.issueAction({
      email,
      purpose,
      tokenHash: this.security.hashToken(token),
      expiresAt: new Date(Date.now() + ttl * 1000),
    });

    if (!issued) {
      return;
    }

    if (purpose === AuthActionPurpose.VERIFY_EMAIL) {
      await this.mail.sendVerification(email, token);
    } else {
      await this.mail.sendPasswordReset(email, token);
    }
  }
}

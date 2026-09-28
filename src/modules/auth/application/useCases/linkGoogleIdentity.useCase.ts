import { normalizeEmail } from '../../../../shared/text/email.js';
import { AuthIdentity } from '../../domain/entities/authIdentity.entity.js';
import { AuthError } from '../../domain/errors/auth.error.js';
import type { AuthSecurity } from '../ports/authSecurity.port.js';
import type { AuthUnitOfWork } from '../ports/authUnitOfWork.port.js';
import type { GoogleIdentityProvider } from '../ports/googleIdentityProvider.port.js';
import type { LinkGoogleIdentityInput } from '../types/auth.types.js';

export class LinkGoogleIdentityUseCase {
  constructor(
    private readonly unitOfWork: AuthUnitOfWork,
    private readonly security: AuthSecurity,
    private readonly google: GoogleIdentityProvider,
  ) {}

  async execute(input: LinkGoogleIdentityInput): Promise<void> {
    const { credential, email, userId } = input;

    const profile = await this.google.verifyCredential(credential);

    if (!profile.emailVerified) {
      throw new AuthError('GOOGLE_EMAIL_NOT_VERIFIED');
    }

    if (normalizeEmail(profile.email) !== normalizeEmail(email)) {
      throw new AuthError('GOOGLE_EMAIL_MISMATCH');
    }

    const identity = AuthIdentity.google({
      id: this.security.newId(),
      userId,
      providerAccountId: profile.subject,
    });

    await this.unitOfWork.run((tx) => tx.auth.linkIdentity(identity.snapshot()));
  }
}

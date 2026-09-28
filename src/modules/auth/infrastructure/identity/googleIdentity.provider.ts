import { OAuth2Client } from 'google-auth-library';

import { normalizeEmail } from '../../../../shared/text/email.js';
import type { GoogleIdentityProfile } from '../../application/ports/googleIdentityProvider.port.js';
import { GoogleIdentityProvider } from '../../application/ports/googleIdentityProvider.port.js';
import { AuthError } from '../../domain/errors/auth.error.js';

export class GoogleIdentityVerifier extends GoogleIdentityProvider {
  private readonly client = new OAuth2Client();

  constructor(private readonly clientId: string) {
    super();
  }

  async verifyCredential(credential: string): Promise<GoogleIdentityProfile> {
    if (!credential || credential.length > 8192) {
      throw new AuthError('INVALID_GOOGLE_CREDENTIAL');
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: this.clientId,
      });

      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email || typeof payload.email_verified !== 'boolean') {
        throw new AuthError('INVALID_GOOGLE_CREDENTIAL');
      }

      const email = normalizeEmail(payload.email);

      return {
        subject: payload.sub,
        email,
        name: this.resolveName(payload.name, payload.given_name, email),
        emailVerified: payload.email_verified,
        hostedDomain: typeof payload.hd === 'string' && payload.hd.trim() ? payload.hd.trim() : null,
      };
    } catch (error: unknown) {
      if (error instanceof AuthError) {
        throw error;
      }

      throw new AuthError('INVALID_GOOGLE_CREDENTIAL');
    }
  }

  private resolveName(fullName: string | undefined, givenName: string | undefined, email: string): string {
    const candidate = fullName?.trim() || givenName?.trim() || email.split('@')[0]?.trim() || '';

    const name = Array.from(candidate).slice(0, 100).join('').trim();

    return name.length >= 2 ? name : 'Conta Google';
  }
}

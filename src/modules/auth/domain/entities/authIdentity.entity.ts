import { AuthProvider } from '../../../../generated/prisma/enums.js';
import { AuthError } from '../errors/auth.error.js';

export interface AuthIdentityProps {
  id: string;
  userId: string;
  provider: AuthProvider;
  providerAccountId: string;
}

export interface GoogleParams {
  id: string;
  userId: string;
  providerAccountId: string;
}

export class AuthIdentity {
  private constructor(private readonly props: AuthIdentityProps) {}

  static google(params: { id: string; userId: string; providerAccountId: string }): AuthIdentity {
    const providerAccountId = params.providerAccountId.trim();

    if (!params.id || !params.userId || !providerAccountId || providerAccountId.length > 255) {
      throw new AuthError('INVALID_GOOGLE_CREDENTIAL');
    }

    return new AuthIdentity({
      id: params.id,
      userId: params.userId,
      provider: AuthProvider.GOOGLE,
      providerAccountId,
    });
  }

  snapshot(): AuthIdentityProps {
    return {
      ...this.props,
    };
  }
}

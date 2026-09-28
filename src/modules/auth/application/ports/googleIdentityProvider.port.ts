export interface GoogleIdentityProfile {
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
  hostedDomain: string | null;
}

export abstract class GoogleIdentityProvider {
  abstract verifyCredential(credential: string): Promise<GoogleIdentityProfile>;
}

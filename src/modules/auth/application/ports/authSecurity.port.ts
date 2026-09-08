export interface AccessClaims {
  sub: string;
  sid: string;
}

export abstract class AuthSecurity {
  abstract hashPassword(password: string): Promise<string>;
  abstract verifyPassword(hash: string, password: string): Promise<boolean>;
  abstract dummyVerify(password: string): Promise<void>;
  abstract newToken(): string;
  abstract hashToken(token: string): string;
  abstract newId(): string;
  abstract signAccess(claims: AccessClaims): Promise<string>;
  abstract verifyAccess(token: string): Promise<AccessClaims>;
}

export abstract class AuthMail {
  abstract sendVerification(email: string, token: string): Promise<void>;
  abstract sendPasswordReset(email: string, token: string): Promise<void>;
}

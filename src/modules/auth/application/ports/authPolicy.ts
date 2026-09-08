export interface AuthPolicy {
  accessTtlSeconds: number;
  idleTtlSeconds: number;
  absoluteTtlSeconds: number;
  verificationTtlSeconds: number;
  resetTtlSeconds: number;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

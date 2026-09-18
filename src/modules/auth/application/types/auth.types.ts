import type { SessionRevocationReason } from '../../../../generated/prisma/enums.js';

export interface LoginInput {
  email: string;
  password: string;
  userAgent: string | null;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export interface LogoutInput {
  refreshToken: string;
  reason: SessionRevocationReason;
}

export interface AuthPolicy {
  accessTtlSeconds: number;
  idleTtlSeconds: number;
  absoluteTtlSeconds: number;
  verificationTtlSeconds: number;
  resetTtlSeconds: number;
}

export interface AuthCleanupParams {
  expiredBefore: Date;
  rateLimitBefore: Date;
  limit: number;
}

export interface AuthCleanupResult {
  refreshTokens: number;
  sessions: number;
  actionTokens: number;
  rateLimits: number;
}

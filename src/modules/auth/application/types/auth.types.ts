import type { SessionRevocationReason } from '../../../../generated/prisma/enums.js';

export interface LoginInput {
  email: string;
  password: string;
  userAgent: string | null;
  previousRefreshToken?: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RegisterUserInput {
  selectedPlanPriceId?: string | null;
  name: string;
  email: string;
  password: string;
  termsVersion: string;
  privacyNoticeVersion: string;
  ipAddress: string | null;
  userAgent: string | null;
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
  refreshTokenBefore: Date;
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

export interface VerifyEmailInput {
  token: string;
  userAgent: string | null;
  previousRefreshToken?: string;
}

export type VerifyEmailResult = LoginResult;

export interface GoogleLoginInput {
  credential: string;
  selectedPlanPriceId?: string | null;
  termsVersion?: string;
  privacyNoticeVersion?: string;
  ipAddress: string | null;
  userAgent: string | null;
  previousRefreshToken?: string;
}

export interface LinkGoogleIdentityInput {
  userId: string;
  email: string;
  credential: string;
}

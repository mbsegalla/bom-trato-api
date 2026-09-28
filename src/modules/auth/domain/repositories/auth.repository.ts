import type { AuthActionPurpose, AuthProvider, SessionRevocationReason } from '../../../../generated/prisma/enums.js';
import type { User } from '../../../users/domain/entities/user.entity.js';
import type { AuthenticatedUser } from '../../../users/domain/types/user.types.js';
import type { AuthIdentityProps } from '../entities/authIdentity.entity.js';
import type { AuthSessionProps } from '../entities/authSession.entity.js';

export interface SessionIdentity {
  userId: string;
  sessionId: string;
}

export interface SessionSummary {
  id: string;
  createdAt: Date;
  lastRefreshedAt: Date;
  absoluteExpiresAt: Date;
  userAgent: string | null;
}

export interface RegisterUserParams {
  selectedPlanPriceId: string | null;
  name: string;
  email: string;
  passwordHash: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface StartSessionParams {
  session: AuthSessionProps;
  expectedPasswordHash: string;
  refreshHash: string;
}

export interface RotateSessionParams {
  tokenHash: string;
  nextHash: string;
  now: Date;
  idleSeconds: number;
}

export interface RotateSessionResult {
  identity: SessionIdentity;
  expiresAt: Date;
}

export interface IssueActionParams {
  email: string;
  purpose: AuthActionPurpose;
  tokenHash: string;
  expiresAt: Date;
}

export interface ConsumeActionParams {
  tokenHash: string;
  purpose: AuthActionPurpose;
  now: Date;
  passwordHash?: string;
}

export interface RevokeSessionParams {
  identity: SessionIdentity;
  now: Date;
  reason: SessionRevocationReason;
}

export interface RevokeByTokenParams {
  tokenHash: string;
  now: Date;
  reason: SessionRevocationReason;
}

export interface RegisterFederatedUserParams {
  userId: string;
  selectedPlanPriceId: string | null;
  name: string;
  email: string;
  emailVerifiedAt: Date;
  identity: AuthIdentityProps;
}

export interface StartFederatedSessionParams {
  session: AuthSessionProps;
  refreshHash: string;
}

export abstract class AuthRepository {
  abstract findUserByEmail(email: string): Promise<User | null>;
  abstract findUserByIdentity(provider: AuthProvider, providerAccountId: string): Promise<User | null>;
  abstract register(params: RegisterUserParams): Promise<boolean>;
  abstract registerFederated(params: RegisterFederatedUserParams): Promise<User>;
  abstract startFederatedSession(params: StartFederatedSessionParams): Promise<void>;
  abstract linkIdentity(identity: AuthIdentityProps): Promise<void>;
  abstract listIdentityProviders(userId: string): Promise<AuthProvider[]>;
  abstract startSession(params: StartSessionParams): Promise<void>;
  abstract rotate(params: RotateSessionParams): Promise<RotateSessionResult>;
  abstract authenticate(identity: SessionIdentity, now: Date): Promise<AuthenticatedUser>;
  abstract revoke(params: RevokeSessionParams): Promise<void>;
  abstract revokeByToken(params: RevokeByTokenParams): Promise<void>;
  abstract revokeAll(userId: string, now: Date): Promise<void>;
  abstract listSessions(userId: string, now: Date): Promise<SessionSummary[]>;
  abstract issueAction(params: IssueActionParams): Promise<boolean>;
  abstract consumeAction(params: ConsumeActionParams): Promise<string>;
}

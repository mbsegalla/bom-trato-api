import type { SessionRevocationReason } from '../../../../generated/prisma/enums.js';
import { AuthError } from '../errors/auth.error.js';

export interface AuthSessionProps {
  id: string;
  userId: string;
  createdAt: Date;
  lastRefreshedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revocationReason: SessionRevocationReason | null;
  userAgent: string | null;
}

export class AuthSession {
  private constructor(private readonly props: AuthSessionProps) {}

  static restore(props: AuthSessionProps): AuthSession {
    return new AuthSession({
      id: props.id,
      userId: props.userId,
      createdAt: new Date(props.createdAt),
      lastRefreshedAt: new Date(props.lastRefreshedAt),
      idleExpiresAt: new Date(props.idleExpiresAt),
      absoluteExpiresAt: new Date(props.absoluteExpiresAt),
      revokedAt: props.revokedAt === null ? null : new Date(props.revokedAt),
      revocationReason: props.revocationReason,
      userAgent: props.userAgent,
    });
  }

  static start(
    id: string,
    userId: string,
    now: Date,
    idleSeconds: number,
    absoluteSeconds: number,
    userAgent: string | null,
  ): AuthSession {
    if (idleSeconds <= 0 || absoluteSeconds < idleSeconds) {
      throw new Error('Invalid session expiration policy');
    }

    return new AuthSession({
      id,
      userId,
      createdAt: now,
      lastRefreshedAt: now,
      idleExpiresAt: new Date(now.getTime() + idleSeconds * 1000),
      absoluteExpiresAt: new Date(now.getTime() + absoluteSeconds * 1000),
      revokedAt: null,
      revocationReason: null,
      userAgent: userAgent?.slice(0, 300) ?? null,
    });
  }

  assertActive(now: Date): void {
    if (this.props.revokedAt !== null || now >= this.props.idleExpiresAt || now >= this.props.absoluteExpiresAt) {
      throw new AuthError('INVALID_SESSION');
    }
  }

  renew(now: Date, idleSeconds: number): void {
    this.assertActive(now);
    this.props.lastRefreshedAt = now;
    this.props.idleExpiresAt = new Date(
      Math.min(now.getTime() + idleSeconds * 1000, this.props.absoluteExpiresAt.getTime()),
    );
  }

  revoke(now: Date, reason: SessionRevocationReason | null): void {
    if (this.props.revokedAt === null) {
      this.props.revokedAt = now;
      this.props.revocationReason = reason;
    }
  }

  snapshot(): AuthSessionProps {
    return structuredClone(this.props);
  }
}

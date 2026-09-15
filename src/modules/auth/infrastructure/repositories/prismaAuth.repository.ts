import { Injectable } from '@nestjs/common';

import { AuthActionPurpose, type Prisma, SessionRevocationReason } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { User } from '../../../users/domain/entities/user.entity.js';
import { AuthActionToken } from '../../domain/entities/authActionToken.entity.js';
import { AuthSession } from '../../domain/entities/authSession.entity.js';
import { RefreshToken } from '../../domain/entities/refreshToken.entity.js';
import { AuthError } from '../../domain/errors/auth.error.js';
import { AuthSessionPolicy } from '../../domain/policies/authSession.policy.js';
import {
  AuthRepository,
  ConsumeActionParams,
  IssueActionParams,
  RegisterUserParams,
  RevokeByTokenParams,
  RevokeSessionParams,
  RotateSessionParams,
  SessionIdentity,
  StartSessionParams,
} from '../../domain/repositories/auth.repository.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  emailVerifiedAt: true,
  disabledAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async lockUser(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${id}::uuid
      FOR UPDATE
    `;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
      select: userSelect,
    });

    return row === null ? null : User.restore(row);
  }

  async register(params: RegisterUserParams): Promise<boolean> {
    const { name, email, passwordHash, tokenHash, expiresAt } = params;

    try {
      await this.prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          authActionTokens: {
            create: {
              purpose: AuthActionPurpose.VERIFY_EMAIL,
              tokenHash,
              expiresAt,
            },
          },
        },
        select: { id: true },
      });

      return true;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        return false;
      }

      throw error;
    }
  }

  async startSession(params: StartSessionParams): Promise<void> {
    const { session, expectedPasswordHash, refreshHash } = params;

    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, session.userId);

      const row = await tx.user.findUnique({
        where: { id: session.userId },
        select: userSelect,
      });

      if (row === null || row.passwordHash !== expectedPasswordHash) {
        throw new AuthError('INVALID_CREDENTIALS');
      }

      User.restore(row).assertCanAuthenticate();

      const active = await tx.authSession.findMany({
        where: {
          userId: row.id,
          revokedAt: null,
          idleExpiresAt: { gt: session.createdAt },
          absoluteExpiresAt: { gt: session.createdAt },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });

      // Keep at most 10 active sessions per user.
      const sessionsToRevoke = AuthSessionPolicy.sessionsToRevoke(active);

      if (sessionsToRevoke.length > 0) {
        await tx.authSession.updateMany({
          where: {
            id: { in: sessionsToRevoke },
          },
          data: {
            revokedAt: session.createdAt,
            revocationReason: SessionRevocationReason.SESSION_LIMIT,
          },
        });
      }

      await tx.authSession.create({
        data: {
          ...session,
          refreshTokens: {
            create: {
              tokenHash: refreshHash,
              expiresAt: session.idleExpiresAt,
            },
          },
        },
        select: { id: true },
      });
    });
  }

  async rotate(params: RotateSessionParams) {
    const { tokenHash, now, idleSeconds } = params;

    const result = await this.prisma.$transaction(async (tx) => {
      const locator = await tx.refreshToken.findUnique({
        where: { tokenHash },
        select: { sessionId: true },
      });

      if (locator === null) {
        throw new AuthError('INVALID_TOKEN');
      }

      const sessionLocator = await tx.authSession.findUnique({
        where: { id: locator.sessionId },
        select: { userId: true },
      });

      if (sessionLocator === null) {
        throw new AuthError('INVALID_TOKEN');
      }

      await this.lockUser(tx, sessionLocator.userId);

      const row = await tx.refreshToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          sessionId: true,
          expiresAt: true,
          usedAt: true,
        },
      });

      if (row === null) {
        throw new AuthError('INVALID_TOKEN');
      }

      const sessionRow = await tx.authSession.findUnique({
        where: { id: row.sessionId },
        include: {
          user: { select: userSelect },
        },
      });

      if (sessionRow === null) {
        throw new AuthError('INVALID_TOKEN');
      }

      const session = AuthSession.restore(sessionRow);
      const token = new RefreshToken(row.id, row.sessionId, row.expiresAt, row.usedAt);

      try {
        token.consume(now);
      } catch (error: unknown) {
        if (error instanceof AuthError && error.code === 'TOKEN_REUSED') {
          session.revoke(now, 'REFRESH_REUSE');

          const state = session.snapshot();

          await tx.authSession.update({
            where: { id: state.id },
            data: {
              revokedAt: state.revokedAt,
              revocationReason: state.revocationReason,
            },
          });

          return null;
        }

        throw error;
      }

      User.restore(sessionRow.user).assertCanAuthenticate();
      session.renew(now, idleSeconds);

      const state = session.snapshot();

      await tx.refreshToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      });

      await tx.authSession.update({
        where: { id: state.id },
        data: {
          idleExpiresAt: state.idleExpiresAt,
          lastRefreshedAt: state.lastRefreshedAt,
        },
      });

      await tx.refreshToken.create({
        data: {
          sessionId: state.id,
          tokenHash: params.nextHash,
          expiresAt: state.idleExpiresAt,
        },
      });

      return {
        identity: {
          userId: state.userId,
          sessionId: state.id,
        },
        expiresAt: state.idleExpiresAt,
      };
    });

    if (result === null) {
      throw new AuthError('TOKEN_REUSED');
    }

    return result;
  }

  async authenticate(identity: SessionIdentity, now: Date): Promise<User> {
    const row = await this.prisma.authSession.findUnique({
      where: { id: identity.sessionId },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        lastRefreshedAt: true,
        idleExpiresAt: true,
        absoluteExpiresAt: true,
        revokedAt: true,
        revocationReason: true,
        userAgent: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailVerifiedAt: true,
            disabledAt: true,
          },
        },
      },
    });

    if (row === null || row.userId !== identity.userId) {
      throw new AuthError('INVALID_SESSION');
    }

    AuthSession.restore(row).assertActive(now);

    const user = User.restore({
      ...row.user,
      passwordHash: '',
    });

    user.assertCanAuthenticate();

    return user;
  }

  async revoke(params: RevokeSessionParams): Promise<void> {
    const { identity, now, reason } = params;
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, identity.userId);

      const row = await tx.authSession.findFirst({
        where: {
          id: identity.sessionId,
          userId: identity.userId,
        },
      });

      if (row === null) {
        return;
      }

      const session = AuthSession.restore(row);
      session.revoke(now, reason);

      const state = session.snapshot();

      await tx.authSession.update({
        where: { id: state.id },
        data: {
          revokedAt: state.revokedAt,
          revocationReason: state.revocationReason,
        },
      });
    });
  }

  async revokeByToken({ tokenHash, now, reason }: RevokeByTokenParams): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { sessionId: true },
    });

    if (row === null) {
      return;
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: row.sessionId },
      select: { userId: true },
    });

    if (session === null) {
      return;
    }

    await this.revoke({
      identity: {
        userId: session.userId,
        sessionId: row.sessionId,
      },
      now,
      reason,
    });
  }

  async revokeAll(userId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);

      await tx.authSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revocationReason: 'LOGOUT_ALL',
        },
      });
    });
  }

  async listSessions(userId: string, now: Date) {
    return this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      select: {
        id: true,
        createdAt: true,
        lastRefreshedAt: true,
        absoluteExpiresAt: true,
        userAgent: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  }

  async issueAction(params: IssueActionParams): Promise<boolean> {
    const { email, purpose, tokenHash, expiresAt } = params;

    return this.prisma.$transaction(async (tx) => {
      const locator = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (locator === null) {
        return false;
      }

      await this.lockUser(tx, locator.id);

      const row = await tx.user.findUnique({
        where: { id: locator.id },
        select: userSelect,
      });

      if (
        row === null ||
        row.disabledAt !== null ||
        (purpose === AuthActionPurpose.VERIFY_EMAIL && row.emailVerifiedAt !== null)
      ) {
        return false;
      }

      await tx.authActionToken.updateMany({
        where: {
          userId: row.id,
          purpose,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });

      await tx.authActionToken.create({
        data: {
          userId: row.id,
          purpose,
          tokenHash,
          expiresAt,
        },
      });

      return true;
    });
  }

  async consumeAction(params: ConsumeActionParams): Promise<void> {
    const { tokenHash, purpose, now, passwordHash } = params;

    await this.prisma.$transaction(async (tx) => {
      const locator = await tx.authActionToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
      });

      if (locator === null) {
        throw new AuthError('INVALID_TOKEN');
      }

      await this.lockUser(tx, locator.userId);

      const row = await tx.authActionToken.findUnique({
        where: { tokenHash },
        include: {
          user: { select: userSelect },
        },
      });

      if (row === null) {
        throw new AuthError('INVALID_TOKEN');
      }

      const token = new AuthActionToken(row.id, row.userId, row.purpose, row.expiresAt, row.usedAt);

      token.consume(purpose, now);

      const user = User.restore(row.user);

      if (purpose === AuthActionPurpose.VERIFY_EMAIL) {
        user.verifyEmail(params.now);

        await tx.user.update({
          where: { id: user.id },
          data: {
            emailVerifiedAt: user.emailVerifiedAt,
          },
        });
      } else {
        if (!passwordHash) {
          throw new AuthError('INVALID_TOKEN');
        }

        user.changePassword(passwordHash);

        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash: user.passwordHash,
          },
        });

        await tx.authSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revocationReason: 'PASSWORD_RESET',
          },
        });
      }

      await tx.authActionToken.updateMany({
        where: {
          userId: user.id,
          purpose,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });
    });
  }
}

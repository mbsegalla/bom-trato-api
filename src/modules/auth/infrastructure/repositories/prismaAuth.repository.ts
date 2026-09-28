import { Injectable } from '@nestjs/common';

import {
  AuthActionPurpose,
  AuthProvider,
  type Prisma,
  SessionRevocationReason,
} from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { User } from '../../../users/domain/entities/user.entity.js';
import { UserAccessPolicy } from '../../../users/domain/policies/userAccess.policy.js';
import { AuthenticatedUser } from '../../../users/domain/types/user.types.js';
import { AuthActionToken } from '../../domain/entities/authActionToken.entity.js';
import { AuthIdentityProps } from '../../domain/entities/authIdentity.entity.js';
import { AuthSession, AuthSessionProps } from '../../domain/entities/authSession.entity.js';
import { RefreshToken } from '../../domain/entities/refreshToken.entity.js';
import { AuthError } from '../../domain/errors/auth.error.js';
import { AuthSessionPolicy } from '../../domain/policies/authSession.policy.js';
import {
  AuthRepository,
  ConsumeActionParams,
  IssueActionParams,
  RegisterFederatedUserParams,
  RegisterUserParams,
  RevokeByTokenParams,
  RevokeSessionParams,
  RotateSessionParams,
  SessionIdentity,
  StartFederatedSessionParams,
  StartSessionParams,
} from '../../domain/repositories/auth.repository.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  selectedPlanPriceId: true,
  emailVerifiedAt: true,
  disabledAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: Prisma.TransactionClient = prisma,
  ) {
    super();
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const row = await this.db.user.findUnique({
      where: { email },
      select: userSelect,
    });

    return row === null ? null : User.restore(row);
  }

  async findUserByIdentity(provider: AuthProvider, providerAccountId: string): Promise<User | null> {
    const row = await this.db.authIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      select: {
        user: {
          select: userSelect,
        },
      },
    });

    return row === null ? null : User.restore(row.user);
  }

  async register(params: RegisterUserParams): Promise<boolean> {
    const { name, email, passwordHash, tokenHash, expiresAt, selectedPlanPriceId } = params;

    await this.assertPlanAvailable(selectedPlanPriceId);

    try {
      await this.db.user.create({
        data: {
          name,
          email,
          passwordHash,
          selectedPlanPriceId,
          authActionTokens: {
            create: {
              purpose: AuthActionPurpose.VERIFY_EMAIL,
              tokenHash,
              expiresAt,
            },
          },
        },
        select: {
          id: true,
        },
      });

      return true;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        return false;
      }

      throw error;
    }
  }

  async registerFederated(params: RegisterFederatedUserParams): Promise<User> {
    const { userId, name, email, emailVerifiedAt, selectedPlanPriceId, identity } = params;

    await this.assertPlanAvailable(selectedPlanPriceId);

    try {
      const row = await this.db.user.create({
        data: {
          id: userId,
          name,
          email,
          passwordHash: null,
          emailVerifiedAt,
          selectedPlanPriceId,
          authIdentities: {
            create: {
              id: identity.id,
              provider: identity.provider,
              providerAccountId: identity.providerAccountId,
            },
          },
        },
        select: userSelect,
      });

      return User.restore(row);
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new AuthError('GOOGLE_IDENTITY_CONFLICT');
      }

      throw error;
    }
  }

  async linkIdentity(identity: AuthIdentityProps): Promise<void> {
    await this.transaction(async (tx) => {
      await this.lockUser(tx, identity.userId);

      const user = await tx.user.findUnique({
        where: {
          id: identity.userId,
        },
        select: userSelect,
      });

      if (user === null) {
        throw new AuthError('INVALID_SESSION');
      }

      User.restore(user).assertCanAuthenticate();

      const identityOwner = await tx.authIdentity.findUnique({
        where: {
          provider_providerAccountId: {
            provider: identity.provider,
            providerAccountId: identity.providerAccountId,
          },
        },
        select: {
          userId: true,
        },
      });

      if (identityOwner) {
        if (identityOwner.userId === identity.userId) {
          return;
        }

        throw new AuthError('GOOGLE_IDENTITY_IN_USE');
      }

      const existingProvider = await tx.authIdentity.findUnique({
        where: {
          userId_provider: {
            userId: identity.userId,
            provider: identity.provider,
          },
        },
        select: {
          providerAccountId: true,
        },
      });

      if (existingProvider) {
        if (existingProvider.providerAccountId === identity.providerAccountId) {
          return;
        }

        throw new AuthError('GOOGLE_PROVIDER_ALREADY_LINKED');
      }

      await tx.authIdentity.create({
        data: identity,
        select: {
          id: true,
        },
      });
    });
  }

  async listIdentityProviders(userId: string): Promise<AuthProvider[]> {
    const rows = await this.db.authIdentity.findMany({
      where: {
        userId,
      },
      select: {
        provider: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return rows.map((row) => row.provider);
  }

  async startSession(params: StartSessionParams): Promise<void> {
    const { session, expectedPasswordHash, refreshHash } = params;

    await this.transaction(async (tx) => {
      await this.lockUser(tx, session.userId);

      const row = await tx.user.findUnique({
        where: {
          id: session.userId,
        },
        select: userSelect,
      });

      if (row === null || row.passwordHash === null || row.passwordHash !== expectedPasswordHash) {
        throw new AuthError('INVALID_CREDENTIALS');
      }

      User.restore(row).assertCanAuthenticate();

      await this.createSessionRecord(tx, session, refreshHash);
    });
  }

  async startFederatedSession(params: StartFederatedSessionParams): Promise<void> {
    const { session, refreshHash } = params;

    await this.transaction(async (tx) => {
      await this.lockUser(tx, session.userId);

      const row = await tx.user.findUnique({
        where: {
          id: session.userId,
        },
        select: userSelect,
      });

      if (row === null) {
        throw new AuthError('INVALID_CREDENTIALS');
      }

      User.restore(row).assertCanAuthenticate();

      await this.createSessionRecord(tx, session, refreshHash);
    });
  }

  async rotate(params: RotateSessionParams) {
    const { tokenHash, now, idleSeconds } = params;

    const result = await this.transaction(async (tx) => {
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

  async authenticate(identity: SessionIdentity, now: Date): Promise<AuthenticatedUser> {
    const row = await this.db.authSession.findUnique({
      where: {
        id: identity.sessionId,
      },
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
            selectedPlanPriceId: true,
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
    UserAccessPolicy.assertCanAuthenticate(row.user);

    return row.user;
  }

  async revoke(params: RevokeSessionParams): Promise<void> {
    const { identity, now, reason } = params;

    await this.transaction(async (tx) => {
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
    const row = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      select: { sessionId: true },
    });

    if (row === null) {
      return;
    }

    const session = await this.db.authSession.findUnique({
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
    await this.transaction(async (tx) => {
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
    return this.db.authSession.findMany({
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

    return this.transaction(async (tx) => {
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

  async consumeAction(params: ConsumeActionParams): Promise<string> {
    const { tokenHash, purpose, now, passwordHash } = params;

    return this.transaction(async (tx) => {
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
        user.verifyEmail(now);

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

      return row.user.email;
    });
  }

  private async createSessionRecord(
    tx: Prisma.TransactionClient,
    session: AuthSessionProps,
    refreshHash: string,
  ): Promise<void> {
    const active = await tx.authSession.findMany({
      where: {
        userId: session.userId,
        revokedAt: null,
        idleExpiresAt: {
          gt: session.createdAt,
        },
        absoluteExpiresAt: {
          gt: session.createdAt,
        },
      },
      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      select: {
        id: true,
      },
    });

    const sessionsToRevoke = AuthSessionPolicy.sessionsToRevoke(active);

    if (sessionsToRevoke.length > 0) {
      await tx.authSession.updateMany({
        where: {
          id: {
            in: sessionsToRevoke,
          },
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
      select: {
        id: true,
      },
    });
  }

  private async assertPlanAvailable(selectedPlanPriceId: string | null): Promise<void> {
    if (selectedPlanPriceId === null) {
      return;
    }

    const price = await this.db.planPrice.findFirst({
      where: {
        id: selectedPlanPriceId,
        published: true,
        stripeActive: true,
        plan: {
          published: true,
          stripeActive: true,
        },
      },
      select: {
        id: true,
      },
    });

    if (price === null) {
      throw new AuthError('PLAN_UNAVAILABLE');
    }
  }

  private transaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.db === this.prisma ? this.prisma.$transaction(operation) : operation(this.db);
  }

  private async lockUser(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$queryRaw`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${id}::uuid
      FOR UPDATE
    `;
  }
}

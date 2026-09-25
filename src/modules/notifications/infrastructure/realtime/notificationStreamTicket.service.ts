import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { sha256Hex } from '../../../../shared/security/hmac.js';
import { InAppNotificationError } from '../../domain/errors/inAppNotification.error.js';

const ticketLifetimeMs = 30_000;

const ticketPattern = /^[A-Za-z0-9_-]{43}$/;

interface IssueNotificationStreamTicketParams {
  userId: string;
  sessionId: string;
  organizationId: string;
}

interface NotificationStreamIdentity {
  userId: string;
  organizationId: string;
}

@Injectable()
export class NotificationStreamTicketService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(params: IssueNotificationStreamTicketParams) {
    const { userId, sessionId, organizationId } = params;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ticketLifetimeMs);

    const ticket = randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(ticket);

    await this.prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          idleExpiresAt: {
            gt: now,
          },
          absoluteExpiresAt: {
            gt: now,
          },
        },
        select: {
          id: true,
        },
      });

      if (session === null) {
        throw new InAppNotificationError('INVALID_STREAM_TICKET');
      }

      const member = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
        select: {
          id: true,
        },
      });

      if (member === null) {
        throw new InAppNotificationError('MEMBER_REQUIRED');
      }

      await tx.notificationStreamTicket.deleteMany({
        where: {
          OR: [
            {
              expiresAt: {
                lte: now,
              },
            },
            {
              sessionId,
              organizationId,
            },
          ],
        },
      });

      await tx.notificationStreamTicket.create({
        data: {
          tokenHash,
          sessionId,
          organizationId,
          expiresAt,
        },
      });
    });

    return {
      ticket,
      expiresAt,
    };
  }

  async consume(organizationId: string, ticket: string): Promise<NotificationStreamIdentity> {
    if (!ticketPattern.test(ticket)) {
      throw new InAppNotificationError('INVALID_STREAM_TICKET');
    }

    const tokenHash = sha256Hex(ticket);
    const now = new Date();

    const identity = await this.prisma.$transaction(async (tx): Promise<NotificationStreamIdentity | null> => {
      const streamTicket = await tx.notificationStreamTicket.findUnique({
        where: {
          tokenHash,
        },
        select: {
          id: true,
          sessionId: true,
          organizationId: true,
          expiresAt: true,
        },
      });

      if (streamTicket === null) {
        return null;
      }

      await tx.notificationStreamTicket.delete({
        where: {
          id: streamTicket.id,
        },
      });

      if (streamTicket.organizationId !== organizationId || streamTicket.expiresAt <= now) {
        return null;
      }

      const session = await tx.authSession.findUnique({
        where: {
          id: streamTicket.sessionId,
        },
        select: {
          userId: true,
          revokedAt: true,
          idleExpiresAt: true,
          absoluteExpiresAt: true,
          user: {
            select: {
              disabledAt: true,
              emailVerifiedAt: true,
            },
          },
        },
      });

      if (
        session === null ||
        session.revokedAt !== null ||
        session.idleExpiresAt <= now ||
        session.absoluteExpiresAt <= now ||
        session.user.disabledAt !== null ||
        session.user.emailVerifiedAt === null
      ) {
        return null;
      }

      const member = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: session.userId,
          },
        },
        select: {
          id: true,
        },
      });

      if (member === null) {
        return null;
      }

      return {
        userId: session.userId,
        organizationId,
      };
    });

    if (identity === null) {
      throw new InAppNotificationError('INVALID_STREAM_TICKET');
    }

    return identity;
  }
}

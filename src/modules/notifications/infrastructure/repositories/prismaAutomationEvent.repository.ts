import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AutomationEventProps } from '../../domain/repositories/automationEvent.repository.js';
import { AutomationEventRepository } from '../../domain/repositories/automationEvent.repository.js';

@Injectable()
export class PrismaAutomationEventRepository extends AutomationEventRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async isMember(userId: string, organizationId: string): Promise<boolean> {
    const member = await this.db.organizationMember.findUnique({
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

    return member !== null;
  }

  async list(organizationId: string, limit: number): Promise<AutomationEventProps[]> {
    const rows = await this.db.notificationOutbox.findMany({
      where: {
        organizationId,
        automationType: {
          not: null,
        },
        automationEntityType: {
          not: null,
        },
        automationEntityId: {
          not: null,
        },
        automationDescription: {
          not: null,
        },
        automationHref: {
          not: null,
        },
      },
      select: {
        id: true,
        automationType: true,
        automationEntityType: true,
        automationEntityId: true,
        automationDescription: true,
        automationHref: true,
        status: true,
        availableAt: true,
        createdAt: true,
        finishedAt: true,
        lastErrorCode: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.flatMap((row) => {
      if (
        row.automationType === null ||
        row.automationEntityType === null ||
        row.automationEntityId === null ||
        row.automationDescription === null ||
        row.automationHref === null
      ) {
        return [];
      }

      return [
        {
          id: row.id,
          type: row.automationType,
          entityType: row.automationEntityType,
          entityId: row.automationEntityId,
          description: row.automationDescription,
          href: row.automationHref,
          status: row.status,
          availableAt: row.availableAt,
          createdAt: row.createdAt,
          finishedAt: row.finishedAt,
          lastErrorCode: row.lastErrorCode,
        },
      ];
    });
  }
}

import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { QuoteStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readTransaction } from '../../../../infrastructure/database/prismaTransaction.js';
import { readOrganizationPlatformAccess } from '../../../organizations/infrastructure/access/prismaOrganizationPlatformAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type {
  PublicWorkOrderReadContext,
  PublicWorkOrderTransaction,
} from '../../application/ports/publicWorkOrderUnitOfWork.port.js';
import { PublicWorkOrderUnitOfWork } from '../../application/ports/publicWorkOrderUnitOfWork.port.js';
import type { PublicWorkOrderSnapshot } from '../../application/types/publicWorkOrder.types.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { WorkOrderShareError } from '../../domain/errors/workOrderShare.error.js';
import { PrismaWorkOrderAcceptanceRepository } from '../repositories/prismaWorkOrderAcceptance.repository.js';
import { workOrderPhotoSelect } from '../repositories/prismaWorkOrderPhoto.repository.js';

const workOrderShareSelect = {
  id: true,
  organizationId: true,
  workOrderId: true,
  tokenHash: true,
  createdById: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
} satisfies Prisma.WorkOrderShareSelect;

const publicWorkOrderSelect = {
  id: true,
  organizationId: true,
  title: true,
  version: true,
  status: true,
  currency: true,
  subtotalInCents: true,
  discountInCents: true,
  totalInCents: true,
  assignedToId: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  startedAt: true,
  completedAt: true,
  canceledAt: true,
  createdAt: true,

  organization: {
    select: {
      name: true,
      logoKey: true,
    },
  },

  quote: {
    select: {
      quoteStatusHistories: {
        where: {
          toStatus: QuoteStatus.APPROVED,
        },
        orderBy: {
          version: 'desc',
        },
        take: 1,
        select: {
          createdAt: true,
        },
      },
    },
  },

  workOrderItems: {
    orderBy: [
      {
        position: 'asc',
      },
      {
        id: 'asc',
      },
    ],
    select: {
      name: true,
      description: true,
      unit: true,
      quantityInThousandths: true,
      unitAmountInCents: true,
      totalInCents: true,
      position: true,
    },
  },

  workOrderStatusHistory: {
    orderBy: {
      version: 'asc',
    },
    select: {
      fromStatus: true,
      toStatus: true,
      version: true,
      createdAt: true,
    },
  },

  workOrderScheduleHistories: {
    orderBy: {
      version: 'asc',
    },
    select: {
      fromStatus: true,
      toStatus: true,
      fromStartAt: true,
      fromEndAt: true,
      toStartAt: true,
      toEndAt: true,
      version: true,
      createdAt: true,
    },
  },

  receivables: {
    select: {
      currency: true,
      amountInCents: true,
      receivedInCents: true,
      status: true,
    },
  },

  workOrderPhotos: {
    where: { visibleInPortal: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, stage: true, caption: true, width: true, height: true, createdAt: true },
  },

  warranty: { select: { durationDays: true, terms: true } },

  workOrderChecklistItems: {
    where: { visibleInPortal: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, completed: true, completedAt: true },
  },
} satisfies Prisma.WorkOrderSelect;

@Injectable()
export class PrismaPublicWorkOrderUnitOfWork extends PublicWorkOrderUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(tokenHash: string, operation: (context: PublicWorkOrderReadContext) => Promise<T>): Promise<T> {
    return readTransaction(this.prisma, async (db) => operation(await this.createContext(db, tokenHash)));
  }

  async run<T>(tokenHash: string, operation: (tx: PublicWorkOrderTransaction) => Promise<T>): Promise<T> {
    const source = await this.prisma.workOrderShare.findUnique({
      where: { tokenHash },
      select: { organizationId: true },
    });

    if (source === null) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }

    return organizationTransaction(
      this.prisma,
      source.organizationId,
      'write',
      async (db) => operation(await this.createContext(db, tokenHash, source.organizationId)),
      {
        notFound: () => new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND'),
        busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
      },
    );
  }

  private async createContext(
    db: Prisma.TransactionClient,
    tokenHash: string,
    organizationId?: string,
  ): Promise<PublicWorkOrderTransaction> {
    const share = await db.workOrderShare.findUnique({
      where: {
        tokenHash,
      },
      select: workOrderShareSelect,
    });

    if (share === null || (organizationId !== undefined && share.organizationId !== organizationId)) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }

    return {
      share,
      acceptances: new PrismaWorkOrderAcceptanceRepository(db, share.organizationId, share.workOrderId),
      findPlatformAccess: async () =>
        (await readOrganizationPlatformAccess(db, share.organizationId, new Date())).access,
      findWorkOrder: () => this.findWorkOrder(db, share.organizationId, share.workOrderId),
      findPhoto: (photoId) =>
        db.workOrderPhoto.findFirst({
          where: {
            id: photoId,
            organizationId: share.organizationId,
            workOrderId: share.workOrderId,
            visibleInPortal: true,
          },
          select: workOrderPhotoSelect,
        }),
    };
  }

  private async findWorkOrder(
    db: Prisma.TransactionClient,
    organizationId: string,
    workOrderId: string,
  ): Promise<PublicWorkOrderSnapshot | null> {
    const workOrder = await db.workOrder.findFirst({
      where: {
        id: workOrderId,
        organizationId,
      },
      select: publicWorkOrderSelect,
    });

    if (workOrder === null) {
      return null;
    }

    const {
      assignedToId,
      workOrderItems,
      workOrderPhotos,
      workOrderChecklistItems,
      workOrderStatusHistory,
      workOrderScheduleHistories,
      quote,
      ...state
    } = workOrder;

    const assignedToName = await this.findResponsibleName(db, organizationId, assignedToId);

    return {
      ...state,
      assignedToName,
      items: workOrderItems,
      photos: workOrderPhotos,
      checklistItems: workOrderChecklistItems,
      timelineSource: {
        quoteApprovedAt: quote.quoteStatusHistories[0]?.createdAt ?? null,
        statusHistory: workOrderStatusHistory,
        scheduleHistory: workOrderScheduleHistories,
      },
    };
  }

  private async findResponsibleName(
    db: Prisma.TransactionClient,
    organizationId: string,
    userId: string | null,
  ): Promise<string | null> {
    if (userId === null) {
      return null;
    }

    const member = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: {
        user: {
          select: {
            name: true,
            disabledAt: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (member === null || member.user.disabledAt !== null || member.user.emailVerifiedAt === null) {
      return null;
    }

    return member.user.name;
  }
}

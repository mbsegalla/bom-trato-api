import type { Prisma } from '../../../../generated/prisma/client.js';
import type { WorkOrderShare, WorkOrderShareProps } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderShareError } from '../../domain/errors/workOrderShare.error.js';
import { WorkOrderShareRepository } from '../../domain/repositories/workOrderShare.repository.js';

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

export class PrismaWorkOrderShareRepository extends WorkOrderShareRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  findByHash(tokenHash: string): Promise<WorkOrderShareProps | null> {
    return this.db.workOrderShare.findFirst({
      where: {
        organizationId: this.organizationId,
        tokenHash,
      },
      select: workOrderShareSelect,
    });
  }

  findCurrent(workOrderId: string, now: Date): Promise<WorkOrderShareProps | null> {
    return this.db.workOrderShare.findFirst({
      where: {
        organizationId: this.organizationId,
        workOrderId,
        activeWorkOrderId: workOrderId,
        revokedAt: null,
        createdAt: {
          lte: now,
        },
        expiresAt: {
          gt: now,
        },
      },
      select: workOrderShareSelect,
    });
  }

  async create(share: WorkOrderShare): Promise<void> {
    const state = share.snapshot();

    if (state.organizationId !== this.organizationId || state.revokedAt !== null) {
      throw new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND');
    }

    await this.db.workOrderShare.create({
      data: {
        ...state,
        activeWorkOrderId: state.workOrderId,
      },
    });
  }

  async revokeForWorkOrder(workOrderId: string, now: Date): Promise<void> {
    await this.db.workOrderShare.updateMany({
      where: {
        organizationId: this.organizationId,
        workOrderId,
        revokedAt: null,
      },
      data: {
        activeWorkOrderId: null,
        revokedAt: now,
      },
    });
  }
}

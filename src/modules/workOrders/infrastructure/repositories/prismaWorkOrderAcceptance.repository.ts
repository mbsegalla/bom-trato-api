import type { Prisma } from '../../../../generated/prisma/client.js';
import type {
  WorkOrderAcceptance,
  WorkOrderAcceptanceProps,
  WorkOrderAcceptanceSnapshot,
} from '../../domain/entities/workOrderAcceptance.entity.js';
import { WorkOrderAcceptanceError } from '../../domain/errors/workOrderAcceptance.error.js';
import { WorkOrderAcceptanceRepository } from '../../domain/repositories/workOrderAcceptance.repository.js';

const acceptanceSelect = {
  id: true,
  organizationId: true,
  workOrderId: true,
  shareId: true,
  signerName: true,
  acceptedAt: true,
  completedAt: true,
  workOrderVersion: true,
  consentVersion: true,
  consentText: true,
  snapshotHash: true,
  snapshot: true,
} satisfies Prisma.WorkOrderAcceptanceSelect;

export class PrismaWorkOrderAcceptanceRepository extends WorkOrderAcceptanceRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
    private readonly workOrderId: string,
  ) {
    super();
  }

  async findForCompletion(completedAt: Date): Promise<WorkOrderAcceptanceProps | null> {
    const record = await this.db.workOrderAcceptance.findFirst({
      where: { organizationId: this.organizationId, workOrderId: this.workOrderId, completedAt },
      select: acceptanceSelect,
    });

    if (record === null) {
      return null;
    }

    return { ...record, snapshot: record.snapshot as unknown as WorkOrderAcceptanceSnapshot };
  }

  async create(acceptance: WorkOrderAcceptance): Promise<void> {
    const state = acceptance.snapshot();

    if (state.organizationId !== this.organizationId || state.workOrderId !== this.workOrderId) {
      throw new WorkOrderAcceptanceError('WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE');
    }

    await this.db.workOrderAcceptance.create({
      data: {
        ...state,
        consent: true,
        snapshot: state.snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

import type { Prisma } from '../../../../generated/prisma/client.js';
import type {
  WorkOrderChecklistItem,
  WorkOrderChecklistItemProps,
} from '../../domain/entities/workOrderChecklistItem.entity.js';
import { WorkOrderChecklistError } from '../../domain/errors/workOrderChecklist.error.js';
import { WorkOrderChecklistRepository } from '../../domain/repositories/workOrderChecklist.repository.js';

export const workOrderChecklistItemSelect = {
  id: true,
  organizationId: true,
  workOrderId: true,
  title: true,
  position: true,
  completed: true,
  completedAt: true,
  completedById: true,
  visibleInPortal: true,
  version: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkOrderChecklistItemSelect;

export class PrismaWorkOrderChecklistRepository extends WorkOrderChecklistRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
    private readonly workOrderId: string,
  ) {
    super();
  }

  list(): Promise<WorkOrderChecklistItemProps[]> {
    return this.db.workOrderChecklistItem.findMany({
      where: this.scope(),
      select: workOrderChecklistItemSelect,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  findById(itemId: string): Promise<WorkOrderChecklistItemProps | null> {
    return this.db.workOrderChecklistItem.findFirst({
      where: { ...this.scope(), id: itemId },
      select: workOrderChecklistItemSelect,
    });
  }

  async create(item: WorkOrderChecklistItem): Promise<void> {
    const state = item.snapshot();

    this.assertScope(state);

    await this.db.workOrderChecklistItem.create({ data: state });
  }

  async save(item: WorkOrderChecklistItem, expectedVersion: number): Promise<void> {
    const state = item.snapshot();

    this.assertScope(state);

    const result = await this.db.workOrderChecklistItem.updateMany({
      where: { ...this.scope(), id: state.id, version: expectedVersion },
      data: {
        title: state.title,
        position: state.position,
        completed: state.completed,
        completedAt: state.completedAt,
        completedById: state.completedById,
        visibleInPortal: state.visibleInPortal,
        version: state.version,
        updatedById: state.updatedById,
        updatedAt: state.updatedAt,
      },
    });

    this.assertChanged(result.count);
  }

  async delete(itemId: string, expectedVersion: number): Promise<void> {
    const result = await this.db.workOrderChecklistItem.deleteMany({
      where: { ...this.scope(), id: itemId, version: expectedVersion },
    });

    this.assertChanged(result.count);
  }

  private scope() {
    return { organizationId: this.organizationId, workOrderId: this.workOrderId };
  }

  private assertScope(item: WorkOrderChecklistItemProps): void {
    if (item.organizationId !== this.organizationId || item.workOrderId !== this.workOrderId) {
      throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND');
    }
  }

  private assertChanged(count: number): void {
    if (count !== 1) {
      throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
    }
  }
}

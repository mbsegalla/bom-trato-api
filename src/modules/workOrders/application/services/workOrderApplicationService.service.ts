import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { WorkOrder } from '../../domain/entities/workOrder.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type {
  WorkOrderActorParams,
  WorkOrderReadContext,
  WorkOrderTransaction,
  WorkOrderUnitOfWork,
} from '../ports/workOrderUnitOfWork.port.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class WorkOrderApplicationService {
  constructor(private readonly unitOfWork: WorkOrderUnitOfWork) {}

  read<T>(params: WorkOrderActorParams, operation: (context: WorkOrderReadContext) => Promise<T>): Promise<T> {
    return this.unitOfWork.read(params, (context) => {
      OrganizationAccessPolicy.assertCanOperate(context.access, (code) => new WorkOrderError(code));

      return operation(context);
    });
  }

  run<T>(params: WorkOrderActorParams, operation: (tx: WorkOrderTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      OrganizationAccessPolicy.assertCanOperate(tx.access, (code) => new WorkOrderError(code));

      return operation(tx);
    });
  }

  async load(context: WorkOrderReadContext, id: string): Promise<WorkOrder> {
    const state = await context.workOrders.findById(id);

    if (state === null) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }

    return WorkOrder.restore(state);
  }

  mutate(
    params: ChangeWorkOrderParams,
    operation: (order: WorkOrder, tx: WorkOrderTransaction, now: Date) => void | Promise<void>,
  ) {
    return this.run(params, async (tx) => {
      const order = await this.load(tx, params.workOrderId);

      order.assertVersion(params.version);

      const now = new Date();

      await operation(order, tx, now);

      order.recordChange(params.userId, now);

      await tx.workOrders.save(order, params.version);

      return order.snapshot();
    });
  }

  async assertAssignee(tx: WorkOrderTransaction, userId: string | null): Promise<void> {
    if (userId === null) {
      throw new WorkOrderError('ASSIGNEE_REQUIRED');
    }

    if (!(await tx.isAssignableMember(userId))) {
      throw new WorkOrderError('ASSIGNEE_NOT_AVAILABLE');
    }
  }
}

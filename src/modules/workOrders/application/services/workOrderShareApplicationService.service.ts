import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type {
  WorkOrderShareReadContext,
  WorkOrderShareSource,
  WorkOrderShareTransaction,
  WorkOrderShareUnitOfWork,
} from '../ports/workOrderShareUnitOfWork.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class WorkOrderShareApplicationService {
  constructor(private readonly unitOfWork: WorkOrderShareUnitOfWork) {}

  read<T>(
    params: WorkOrderByIdParams,
    operation: (context: WorkOrderShareReadContext, workOrder: WorkOrderShareSource) => Promise<T>,
  ): Promise<T> {
    return this.unitOfWork.read(params, async (context) => {
      OrganizationAccessPolicy.assertVerifiedMember(context.access, (code) => new WorkOrderError(code));

      return operation(context, await this.load(context, params.workOrderId));
    });
  }

  run<T>(
    params: WorkOrderByIdParams,
    operation: (tx: WorkOrderShareTransaction, workOrder: WorkOrderShareSource) => Promise<T>,
  ): Promise<T> {
    return this.unitOfWork.run(params, async (tx) => {
      OrganizationAccessPolicy.assertCanOperate(tx.access, (code) => new WorkOrderError(code));

      return operation(tx, await this.load(tx, params.workOrderId));
    });
  }

  runForVerifiedMember<T>(
    params: WorkOrderByIdParams,
    operation: (tx: WorkOrderShareTransaction, workOrder: WorkOrderShareSource) => Promise<T>,
  ): Promise<T> {
    return this.unitOfWork.run(params, async (tx) => {
      OrganizationAccessPolicy.assertVerifiedMember(tx.access, (code) => new WorkOrderError(code));

      return operation(tx, await this.load(tx, params.workOrderId));
    });
  }

  private async load(context: WorkOrderShareReadContext, workOrderId: string): Promise<WorkOrderShareSource> {
    const workOrder = await context.findWorkOrder(workOrderId);

    if (workOrder === null) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }

    return workOrder;
  }
}

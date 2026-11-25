import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type {
  WorkOrderChecklistReadContext,
  WorkOrderChecklistTransaction,
  WorkOrderChecklistUnitOfWork,
} from '../ports/workOrderChecklistUnitOfWork.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class WorkOrderChecklistApplicationService {
  constructor(private readonly unitOfWork: WorkOrderChecklistUnitOfWork) {}

  read<T>(params: WorkOrderByIdParams, operation: (context: WorkOrderChecklistReadContext) => Promise<T>): Promise<T> {
    return this.unitOfWork.read(params, async (context) => {
      await this.assertAccess(context, false);

      return operation(context);
    });
  }

  run<T>(
    params: WorkOrderByIdParams,
    operation: (tx: WorkOrderChecklistTransaction) => Promise<T>,
    requiresOperation = true,
  ): Promise<T> {
    return this.unitOfWork.run(params, async (tx) => {
      await this.assertAccess(tx, requiresOperation);

      return operation(tx);
    });
  }

  private async assertAccess(context: WorkOrderChecklistReadContext, requiresOperation: boolean): Promise<void> {
    if (requiresOperation) {
      OrganizationAccessPolicy.assertCanOperate(context.access, (code) => new WorkOrderError(code));
    } else {
      OrganizationAccessPolicy.assertVerifiedMember(context.access, (code) => new WorkOrderError(code));
    }

    if (!(await context.workOrderExists())) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }
  }
}

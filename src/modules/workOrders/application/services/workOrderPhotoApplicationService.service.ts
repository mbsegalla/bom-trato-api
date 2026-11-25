import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type {
  WorkOrderPhotoReadContext,
  WorkOrderPhotoTransaction,
  WorkOrderPhotoUnitOfWork,
} from '../ports/workOrderPhotoUnitOfWork.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class WorkOrderPhotoApplicationService {
  constructor(private readonly unitOfWork: WorkOrderPhotoUnitOfWork) {}

  read<T>(
    params: WorkOrderByIdParams,
    operation: (context: WorkOrderPhotoReadContext) => Promise<T>,
    requiresOperation = false,
  ): Promise<T> {
    return this.unitOfWork.read(params, async (context) => {
      await this.assertAccess(context, requiresOperation);

      return operation(context);
    });
  }

  run<T>(
    params: WorkOrderByIdParams,
    operation: (tx: WorkOrderPhotoTransaction) => Promise<T>,
    requiresOperation = true,
  ): Promise<T> {
    return this.unitOfWork.run(params, async (tx) => {
      await this.assertAccess(tx, requiresOperation);

      return operation(tx);
    });
  }

  private async assertAccess(context: WorkOrderPhotoReadContext, requiresOperation: boolean): Promise<void> {
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

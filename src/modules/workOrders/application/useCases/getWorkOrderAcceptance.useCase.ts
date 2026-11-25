import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { WorkOrderAcceptance } from '../../domain/entities/workOrderAcceptance.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { toWorkOrderAcceptanceReceipt } from '../mappers/workOrderAcceptance.mapper.js';
import type { WorkOrderAcceptanceUnitOfWork } from '../ports/workOrderAcceptanceUnitOfWork.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderAcceptanceResult } from '../types/workOrderAcceptance.types.js';

export class GetWorkOrderAcceptanceUseCase {
  constructor(private readonly unitOfWork: WorkOrderAcceptanceUnitOfWork) {}

  execute(params: WorkOrderByIdParams): Promise<WorkOrderAcceptanceResult> {
    return this.unitOfWork.read(params, async (context) => {
      OrganizationAccessPolicy.assertVerifiedMember(context.access, (code) => new WorkOrderError(code));

      const workOrder = await context.findWorkOrder();

      if (workOrder === null) {
        throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
      }

      if (workOrder.status !== WorkOrderStatus.COMPLETED || workOrder.completedAt === null) {
        return { receipt: null };
      }

      const record = await context.acceptances.findForCompletion(workOrder.completedAt);

      return {
        receipt:
          record !== null && WorkOrderAcceptance.restore(record).isCurrentFor(workOrder)
            ? toWorkOrderAcceptanceReceipt(record)
            : null,
      };
    });
  }
}

import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { WorkOrderShareRepository } from '../../domain/repositories/workOrderShare.repository.js';
import type { WorkOrderProps } from '../../domain/types/workOrder.types.js';

import type { WorkOrderActorParams } from './workOrderUnitOfWork.port.js';

export type WorkOrderShareSource = Pick<WorkOrderProps, 'id' | 'organizationId' | 'version'>;

export interface WorkOrderShareReadContext {
  readonly access: OrganizationAccessContext;
  readonly shares: Pick<WorkOrderShareRepository, 'findCurrent'>;
  findWorkOrder(workOrderId: string): Promise<WorkOrderShareSource | null>;
}

export interface WorkOrderShareTransaction extends WorkOrderShareReadContext {
  readonly shares: WorkOrderShareRepository;
}

export abstract class WorkOrderShareUnitOfWork {
  abstract read<T>(
    params: WorkOrderActorParams,
    operation: (context: WorkOrderShareReadContext) => Promise<T>,
  ): Promise<T>;

  abstract run<T>(params: WorkOrderActorParams, operation: (tx: WorkOrderShareTransaction) => Promise<T>): Promise<T>;
}

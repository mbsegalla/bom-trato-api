import type { WorkOrderShare, WorkOrderShareProps } from '../entities/workOrderShare.entity.js';

export abstract class WorkOrderShareRepository {
  abstract findByHash(hash: string): Promise<WorkOrderShareProps | null>;
  abstract findCurrent(workOrderId: string, now: Date): Promise<WorkOrderShareProps | null>;
  abstract create(share: WorkOrderShare): Promise<void>;
  abstract revokeForWorkOrder(workOrderId: string, now: Date): Promise<void>;
}

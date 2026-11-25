import type { WorkOrderAcceptance, WorkOrderAcceptanceProps } from '../entities/workOrderAcceptance.entity.js';

export abstract class WorkOrderAcceptanceRepository {
  abstract findForCompletion(completedAt: Date): Promise<WorkOrderAcceptanceProps | null>;
  abstract create(acceptance: WorkOrderAcceptance): Promise<void>;
}

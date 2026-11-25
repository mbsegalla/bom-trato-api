import type { WorkOrderChecklistItem, WorkOrderChecklistItemProps } from '../entities/workOrderChecklistItem.entity.js';

export abstract class WorkOrderChecklistRepository {
  abstract list(): Promise<WorkOrderChecklistItemProps[]>;
  abstract findById(itemId: string): Promise<WorkOrderChecklistItemProps | null>;
  abstract create(item: WorkOrderChecklistItem): Promise<void>;
  abstract save(item: WorkOrderChecklistItem, expectedVersion: number): Promise<void>;
  abstract delete(itemId: string, expectedVersion: number): Promise<void>;
}

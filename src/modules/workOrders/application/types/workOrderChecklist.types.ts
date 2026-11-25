import type { WorkOrderChecklistItemProps } from '../../domain/entities/workOrderChecklistItem.entity.js';

import type { WorkOrderByIdParams } from './workOrder.types.js';

export interface ChangeWorkOrderChecklistItemParams extends WorkOrderByIdParams {
  itemId: string;
  version: number;
}

export interface ReorderWorkOrderChecklistInput {
  items: Array<{ id: string; version: number }>;
}

export type PublicWorkOrderChecklistItem = Pick<
  WorkOrderChecklistItemProps,
  'id' | 'title' | 'completed' | 'completedAt'
>;

export type WorkOrderChecklistItemView = Pick<
  WorkOrderChecklistItemProps,
  | 'id'
  | 'title'
  | 'position'
  | 'completed'
  | 'completedAt'
  | 'completedById'
  | 'visibleInPortal'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
>;

export interface WorkOrderChecklistProgress {
  total: number;
  completed: number;
}

export interface WorkOrderChecklistView {
  items: WorkOrderChecklistItemView[];
  progress: WorkOrderChecklistProgress;
}

export interface PublicWorkOrderChecklist {
  items: PublicWorkOrderChecklistItem[];
  progress: WorkOrderChecklistProgress;
}

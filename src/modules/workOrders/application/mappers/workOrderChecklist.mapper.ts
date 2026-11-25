import type { WorkOrderChecklistItemProps } from '../../domain/entities/workOrderChecklistItem.entity.js';
import type {
  PublicWorkOrderChecklist,
  PublicWorkOrderChecklistItem,
  WorkOrderChecklistItemView,
  WorkOrderChecklistProgress,
  WorkOrderChecklistView,
} from '../types/workOrderChecklist.types.js';

export function toPublicWorkOrderChecklistItem(item: PublicWorkOrderChecklistItem): PublicWorkOrderChecklistItem {
  return {
    id: item.id,
    title: item.title,
    completed: item.completed,
    completedAt: item.completedAt,
  };
}

export function toWorkOrderChecklistItemView(item: WorkOrderChecklistItemProps): WorkOrderChecklistItemView {
  return {
    ...toPublicWorkOrderChecklistItem(item),
    position: item.position,
    completedById: item.completedById,
    visibleInPortal: item.visibleInPortal,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function toWorkOrderChecklistView(items: WorkOrderChecklistItemProps[]): WorkOrderChecklistView {
  return {
    items: items.map(toWorkOrderChecklistItemView),
    progress: toWorkOrderChecklistProgress(items),
  };
}

export function toPublicWorkOrderChecklist(items: PublicWorkOrderChecklistItem[]): PublicWorkOrderChecklist {
  return {
    items: items.map(toPublicWorkOrderChecklistItem),
    progress: toWorkOrderChecklistProgress(items),
  };
}

function toWorkOrderChecklistProgress(items: Array<{ completed: boolean }>): WorkOrderChecklistProgress {
  return { total: items.length, completed: items.filter((item) => item.completed).length };
}

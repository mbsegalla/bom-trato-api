import { randomUUID } from 'node:crypto';

import type { CreateWorkOrderChecklistItemInput } from '../../domain/entities/workOrderChecklistItem.entity.js';
import { WorkOrderChecklistItem } from '../../domain/entities/workOrderChecklistItem.entity.js';
import { toWorkOrderChecklistItemView } from '../mappers/workOrderChecklist.mapper.js';
import type { WorkOrderChecklistApplicationService } from '../services/workOrderChecklistApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderChecklistItemView } from '../types/workOrderChecklist.types.js';

export class CreateWorkOrderChecklistItemUseCase {
  constructor(private readonly processor: WorkOrderChecklistApplicationService) {}

  execute(params: WorkOrderByIdParams, input: CreateWorkOrderChecklistItemInput): Promise<WorkOrderChecklistItemView> {
    return this.processor.run(params, async (tx) => {
      const items = await tx.checklist.list();

      WorkOrderChecklistItem.assertCapacity(items.length);

      const item = WorkOrderChecklistItem.create(
        {
          id: randomUUID(),
          organizationId: params.organizationId,
          workOrderId: params.workOrderId,
          title: input.title,
          position: items.reduce((last, current) => Math.max(last, current.position), -1) + 1,
          createdById: params.userId,
        },
        new Date(),
      );

      await tx.checklist.create(item);

      return toWorkOrderChecklistItemView(item.snapshot());
    });
  }
}

import type { WorkOrderShareApplicationService } from '../services/workOrderShareApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class GetWorkOrderShareUseCase {
  constructor(private readonly processor: WorkOrderShareApplicationService) {}

  execute(params: WorkOrderByIdParams) {
    return this.processor.read(params, async (context, workOrder) => {
      const share = await context.shares.findCurrent(workOrder.id, new Date());

      if (share === null) {
        return null;
      }

      return {
        id: share.id,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
      };
    });
  }
}

import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class GetWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: WorkOrderByIdParams) {
    const { workOrderId } = params;

    return this.processor.read(params, async (context) => {
      const order = await this.processor.load(context, workOrderId);
      return order.snapshot();
    });
  }
}

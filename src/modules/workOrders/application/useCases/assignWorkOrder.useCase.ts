import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class AssignWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams, assignedToId: string | null) {
    return this.processor.mutate(params, async (order, tx) => {
      const previous = order.snapshot();

      if (assignedToId !== null) {
        await this.processor.assertAssignee(tx, assignedToId);
      }

      order.assign(assignedToId);

      const current = order.snapshot();

      if (assignedToId !== null && assignedToId !== params.userId && assignedToId !== previous.assignedToId) {
        await tx.inAppNotifications.enqueue({
          key: `work-order-assigned/${current.id}/${params.version + 1}/${assignedToId}`,
          userId: assignedToId,
          organizationId: current.organizationId,
          type: 'WORK_ORDER_ASSIGNED',
          title: 'Nova ordem de serviço',
          message: `A ordem de serviço "${current.title}" foi atribuída a você.`,
          href: `/work-orders/${current.id}`,
        });
      }
    });
  }
}

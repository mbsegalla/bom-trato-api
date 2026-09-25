import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams, WorkOrderScheduleInput } from '../types/workOrder.types.js';

export class ScheduleWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams, input: WorkOrderScheduleInput) {
    const { scheduledStartAt, scheduledEndAt } = input;

    return this.processor.mutate(params, async (order, tx, now) => {
      const previous = order.snapshot();

      await this.processor.assertAssignee(tx, previous.assignedToId);

      order.schedule(new Date(scheduledStartAt), new Date(scheduledEndAt), now);

      const current = order.snapshot();

      const scheduleChanged =
        previous.scheduledStartAt?.getTime() !== current.scheduledStartAt?.getTime() ||
        previous.scheduledEndAt?.getTime() !== current.scheduledEndAt?.getTime();

      if (scheduleChanged && current.assignedToId !== null && current.assignedToId !== params.userId) {
        const rescheduled = previous.scheduledStartAt !== null;

        await tx.inAppNotifications.enqueue({
          key: `work-order-schedule/${current.id}/${params.version + 1}`,
          userId: current.assignedToId,
          organizationId: current.organizationId,
          type: rescheduled ? 'WORK_ORDER_RESCHEDULED' : 'WORK_ORDER_SCHEDULED',
          title: rescheduled ? 'Ordem de serviço reagendada' : 'Ordem de serviço agendada',
          message: `A ordem de serviço "${current.title}" foi ${rescheduled ? 'reagendada' : 'agendada'}.`,
          href: `/work-orders/${current.id}`,
        });
      }
    });
  }
}

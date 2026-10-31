import { ReceivableError } from '../../domain/errors/receivable.error.js';
import type { ReceivableActorParams } from '../ports/receivableUnitOfWork.port.js';
import type { ReceivableApplicationService } from '../services/receivableApplicationService.service.js';
import { ensureReceivableFromWorkOrder } from '../services/receivableCreation.service.js';
import type { CreateReceivableInput } from '../types/receivable.types.js';

export class CreateReceivableUseCase {
  constructor(private readonly processor: ReceivableApplicationService) {}

  execute(params: ReceivableActorParams, input: CreateReceivableInput) {
    const { workOrderId, dueAt, notes } = input;

    return this.processor.run(params, async (tx) => {
      const source = await tx.findWorkOrder(workOrderId);

      if (source === null) {
        throw new ReceivableError('WORK_ORDER_NOT_FOUND');
      }

      const now = new Date();

      return ensureReceivableFromWorkOrder({
        receivables: tx.receivables,
        organizationId: params.organizationId,
        userId: params.userId,
        source,
        dueAt: new Date(dueAt),
        notes,
        now,
      });
    });
  }
}
